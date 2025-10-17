import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { CustomHttpService } from '@shared/services/http.service';
import { 
  INativeRouter, 
  NativeQuoteRequest, 
  RouteQuote, 
  ExecutionStatus,
  ProviderConfig,
  ProviderHealth,
  IProvider,
  Step 
} from '../../../models/ports';
import type { IAggregatorRegistry } from '@swap/services/core/aggregation/aggregator-registry.interface';
import { AggregatorManagerService } from '@swap/services/core/aggregation/aggregator-manager.service';

/**
 * THORChain native router service implementing INativeRouter port
 * Supports Bitcoin and other native L1 assets cross-chain swaps
 */
@Injectable()
export class ThorChainService implements INativeRouter, IProvider, OnModuleInit {
  private readonly logger = new Logger(ThorChainService.name);
  private readonly baseUrl = 'https://thornode-v1.ninerealms.com';
  private readonly midgardUrl = 'https://midgard.ninerealms.com/v2';

  constructor(
    private readonly httpService: CustomHttpService,
    @Optional() @Inject(AggregatorManagerService) private readonly registry?: IAggregatorRegistry
  ) {}

  /**
   * Self-register with AggregatorManagerService on module initialization
   */
  onModuleInit() {
    if (this.registry) {
      this.registry.registerNativeRouter(this);
      this.logger.debug(`✅ ${this.getProviderName()} self-registered as Native L1 router`);
    } else {
      this.logger.warn(`⚠️ ${this.getProviderName()} could not find registry to self-register`);
    }
  }

  /**
   * Get provider name for identification
   */
  getProviderName(): string {
    return 'THORChain';
  }

  /**
   * Get supported destination chains
   */
  getSupportedDestinations(): number[] {
    // THORChain supports these destination chains
    return [1, 56, 43114]; // Ethereum, BSC, Avalanche
  }

  /**
   * Get quote for Bitcoin to other chains
   */
  async quoteBtc(req: NativeQuoteRequest): Promise<RouteQuote> {
    try {
      const url = `${this.midgardUrl}/thorchain/quote/swap`;
      const params = this.buildQuoteParams(req);
      const headers = this.buildHeaders();

      this.logger.debug(`Getting THORChain quote`, params);
      
      const queryParams = new URLSearchParams(params);
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 15000,
      });

      return this.parseQuoteResponse(response, req);
    } catch (error) {
      this.logger.error(`Failed to get THORChain quote: ${error.message}`, error.stack);
      this.handleApiError(error);
      throw new Error(`THORChain quote failed: ${error.message}`);
    }
  }

  /**
   * Deposit and track cross-chain transaction
   */
  async depositAndTrack(depositTx: string, memo: string): Promise<ExecutionStatus> {
    try {
      // Query THORChain for transaction status
      const url = `${this.midgardUrl}/actions`;
      const headers = this.buildHeaders();

      const queryParams = new URLSearchParams({ 
        txid: depositTx,
        type: 'swap',
      });
      
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 10000,
      });

      return this.parseStatusResponse(response);
    } catch (error) {
      this.logger.error(`Failed to track THORChain deposit: ${error.message}`, error.stack);
      return 'FAILED';
    }
  }

  /**
   * Provider health check
   */
  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      await this.httpService.get(`${this.baseUrl}/thorchain/ping`, {
        headers: this.buildHeaders(),
        timeout: 5000,
      });
      
      const latency = Date.now() - startTime;
      return {
        name: this.getProviderName(),
        status: 'healthy',
        latency,
        lastCheck: new Date(),
        errorRate: 0,
      };
    } catch (error) {
      return {
        name: this.getProviderName(),
        status: 'unhealthy',
        lastCheck: new Date(),
        errorRate: 1,
      };
    }
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return {
      name: this.getProviderName(),
      baseUrl: this.baseUrl,
      enabled: true,
      rateLimit: {
        requests: 5,
        perSeconds: 1,
      },
      timeout: 15000,
      retries: 3,
    };
  }

  /**
   * Get THORChain pools information
   */
  async getPools(): Promise<any[]> {
    try {
      const url = `${this.midgardUrl}/pools`;
      const headers = this.buildHeaders();

      const response = await this.httpService.get<any[]>(url, {
        headers,
        timeout: 10000,
      });

      return response || [];
    } catch (error) {
      this.logger.error(`Failed to get THORChain pools: ${error.message}`);
      throw new Error(`Failed to get THORChain pools: ${error.message}`);
    }
  }

  /**
   * Get network information
   */
  async getNetwork(): Promise<any> {
    try {
      const url = `${this.midgardUrl}/network`;
      const headers = this.buildHeaders();

      const response = await this.httpService.get<any>(url, {
        headers,
        timeout: 10000,
      });

      return response;
    } catch (error) {
      this.logger.error(`Failed to get THORChain network info: ${error.message}`);
      throw new Error(`Failed to get THORChain network info: ${error.message}`);
    }
  }

  /**
   * Build quote parameters for THORChain API
   */
  private buildQuoteParams(req: NativeQuoteRequest): Record<string, string> {
    const params: Record<string, string> = {
      from_asset: 'BTC.BTC',
      to_asset: this.getAssetSymbol(req.toChainId, req.toToken),
      amount: req.amountSats,
    };

    if (req.userAddress) {
      params.destination = req.userAddress;
    }

    return params;
  }

  /**
   * Get THORChain asset symbol from chain ID and token address
   */
  private getAssetSymbol(chainId: number, tokenAddress: string): string {
    // Map chain IDs to THORChain chain symbols
    const chainMap: Record<number, string> = {
      1: 'ETH',    // Ethereum
      56: 'BSC',   // BSC
      43114: 'AVAX', // Avalanche
    };

    const chainSymbol = chainMap[chainId];
    if (!chainSymbol) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    // Handle native tokens
    if (tokenAddress === '0x0000000000000000000000000000000000000000' || 
        tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return `${chainSymbol}.${chainSymbol}`;
    }

    // For ERC20 tokens, you'd need a mapping table
    // This is a simplified example
    const tokenMap: Record<string, string> = {
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 'ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7',
      '0xa0b86a33e6e2a3e6b3a7e5e5d5c5f5e5e5e5e5e5': 'ETH.USDC-0XA0B86A33E6E2A3E6B3A7E5E5D5C5F5E5E5E5E5E5',
    };

    const tokenSymbol = tokenMap[tokenAddress.toLowerCase()];
    if (tokenSymbol) {
      return tokenSymbol;
    }

    // Default to chain native token if mapping not found
    return `${chainSymbol}.${chainSymbol}`;
  }

  /**
   * Build headers for THORChain API requests
   */
  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Parse THORChain quote response
   */
  private parseQuoteResponse(response: any, req: NativeQuoteRequest): RouteQuote {
    const steps: Step[] = [{
      kind: 'native',
      chainId: 0, // Bitcoin (no EVM chain ID)
      details: {
        inboundAddress: response.inbound_address,
        memo: response.memo,
        fees: response.fees,
        expectedAmountOut: response.expected_amount_out,
      },
      protocol: 'THORChain',
      estimatedTime: this.calculateEstimatedTime(response),
    }];

    // Add destination chain step
    steps.push({
      kind: 'swap',
      chainId: req.toChainId,
      details: {
        outboundDelaySeconds: response.outbound_delay_seconds,
        totalSwapSeconds: response.total_swap_seconds,
      },
      protocol: 'THORChain',
    });

    return {
      steps,
      totalEstimatedOut: response.expected_amount_out,
      fees: {
        gas: '0', // Bitcoin network fee handled separately
        provider: response.fees?.total || '0',
        bridge: response.fees?.outbound || '0',
      },
      etaSeconds: response.total_swap_seconds || 600, // Default 10 minutes
      routeId: `thorchain_${Date.now()}`,
      confidence: this.calculateConfidence(response),
      providerRef: {
        thorchainQuote: response,
        memo: response.memo,
        inboundAddress: response.inbound_address,
      },
    };
  }

  /**
   * Parse THORChain status response
   */
  private parseStatusResponse(response: any): ExecutionStatus {
    if (!response.actions || response.actions.length === 0) {
      return 'PENDING';
    }

    const action = response.actions[0];
    switch (action.status?.toLowerCase()) {
      case 'success':
        return 'SUCCESS';
      case 'pending':
        return 'PENDING';
      case 'failed':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Calculate estimated time based on THORChain response
   */
  private calculateEstimatedTime(response: any): number {
    // THORChain provides timing estimates
    const inboundTime = response.inbound_confirmation_seconds || 600; // 10 min default
    const swapTime = response.total_swap_seconds || 300; // 5 min default
    const outboundTime = response.outbound_delay_seconds || 300; // 5 min default

    return inboundTime + swapTime + outboundTime;
  }

  /**
   * Calculate route confidence based on various factors
   */
  private calculateConfidence(response: any): number {
    let confidence = 0.8; // Base confidence for THORChain

    // Increase confidence for reasonable fees
    const feeRatio = parseFloat(response.fees?.total || '0') / parseFloat(response.expected_amount_out || '1');
    if (feeRatio < 0.01) { // Less than 1% fee
      confidence += 0.1;
    } else if (feeRatio > 0.05) { // More than 5% fee
      confidence -= 0.2;
    }

    // Decrease confidence for long estimated times
    const totalTime = response.total_swap_seconds || 600;
    if (totalTime > 1800) { // More than 30 minutes
      confidence -= 0.1;
    }

    // Increase confidence for high liquidity pools
    if (response.expected_amount_out && parseFloat(response.expected_amount_out) > 0) {
      confidence += 0.05;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Handle API errors with specific error messages
   */
  private handleApiError(error: any): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          throw new Error(`Bad request: ${data?.error || 'Invalid parameters'}`);
        case 404:
          throw new Error('Not found: Asset or pool not found');
        case 429:
          throw new Error('Rate limited: Too many requests');
        case 500:
          throw new Error('Internal server error: THORChain API is experiencing issues');
        default:
          throw new Error(`API error (${status}): ${data?.error || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error('Network error: Unable to reach THORChain API');
    } else {
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}