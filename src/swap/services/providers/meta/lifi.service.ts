import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { CustomHttpService } from '@shared/services/http.service';
import { 
  IMetaAggregator, 
  RouteRequest, 
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
 * LI.FI meta-aggregator service implementing IMetaAggregator port
 * Supports cross-chain swaps and bridging
 * NOW WITH SELF-REGISTRATION: Automatically registers itself with AggregatorManagerService
 */
@Injectable()
export class LiFiService implements IMetaAggregator, IProvider, OnModuleInit {
  private readonly logger = new Logger(LiFiService.name);
  private readonly baseUrl = 'https://li.quest/v1';
  private readonly apiKey = process.env.LIFI_API_KEY;

  constructor(
    private readonly httpService: CustomHttpService,
    @Optional() @Inject(AggregatorManagerService) private readonly registry?: IAggregatorRegistry
  ) {}

  /**
   * Self-register with aggregator manager on module initialization
   */
  onModuleInit() {
    if (this.registry) {
      this.registry.registerMetaAggregator(this);
      this.logger.debug(`${this.getProviderName()} self-registered with aggregator manager`);
    } else {
      this.logger.warn(`${this.getProviderName()} could not find registry to self-register`);
    }
  }

  /**
   * Get provider name for identification
   */
  getProviderName(): string {
    return 'LI.FI';
  }

  /**
   * Get supported chain pairs
   */
  getSupportedChains(): { from: number[]; to: number[] } {
    // LI.FI supports many chains - this is a subset
    const chains = [1, 10, 56, 137, 42161, 43114, 8453, 324, 59144, 100, 1101];
    return {
      from: chains,
      to: chains,
    };
  }

  /**
   * Get available cross-chain routes
   */
  async getRoutes(req: RouteRequest): Promise<RouteQuote[]> {
    try {
      const url = `${this.baseUrl}/quote`;
      const params = this.buildRouteParams(req);
      const headers = this.buildHeaders();

      this.logger.debug(`Getting LI.FI routes`, params);
      
      const queryParams = new URLSearchParams(params);
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 20000,
      });

      return this.parseRoutesResponse(response, req);
    } catch (error) {
      this.logger.error(`Failed to get LI.FI routes: ${error.message}`, error.stack);
      this.handleApiError(error);
      throw new Error(`LI.FI routes failed: ${error.message}`);
    }
  }

  /**
   * Execute a specific route
   */
  async execute(routeId: string, signerCtx: any): Promise<{ txids: string[] }> {
    try {
      const url = `${this.baseUrl}/status`;
      const headers = this.buildHeaders();

      // In a real implementation, this would execute the route
      // For now, we'll return a placeholder
      this.logger.debug(`Executing LI.FI route ${routeId}`);
      
      // This would typically involve:
      // 1. Getting the route details
      // 2. Building transactions
      // 3. Signing with provided signer context
      // 4. Broadcasting transactions
      
      return {
        txids: [`0x${routeId}_placeholder`],
      };
    } catch (error) {
      this.logger.error(`Failed to execute LI.FI route: ${error.message}`, error.stack);
      throw new Error(`LI.FI execution failed: ${error.message}`);
    }
  }

  /**
   * Check execution status
   */
  async status(routeId: string): Promise<ExecutionStatus> {
    try {
      const url = `${this.baseUrl}/status`;
      const headers = this.buildHeaders();

      const queryParams = new URLSearchParams({ txHash: routeId });
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 10000,
      });

      return this.parseStatusResponse(response);
    } catch (error) {
      this.logger.error(`Failed to get LI.FI status: ${error.message}`, error.stack);
      return 'FAILED';
    }
  }

  /**
   * Provider health check
   */
  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      await this.httpService.get(`${this.baseUrl}/chains`, {
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
      apiKey: this.apiKey ? '***' : undefined,
      enabled: true,
      rateLimit: {
        requests: 5,
        perSeconds: 1,
      },
      timeout: 20000,
      retries: 3,
    };
  }

  /**
   * Get supported tokens for a chain
   */
  async getTokens(chainId: number): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/tokens`;
      const headers = this.buildHeaders();

      const queryParams = new URLSearchParams({ chains: chainId.toString() });
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 10000,
      });

      return response.tokens || [];
    } catch (error) {
      this.logger.error(`Failed to get LI.FI tokens: ${error.message}`);
      throw new Error(`Failed to get LI.FI tokens: ${error.message}`);
    }
  }

  /**
   * Build route parameters for LI.FI API
   */
  private buildRouteParams(req: RouteRequest): Record<string, string> {
    const params: Record<string, string> = {
      fromChain: req.fromChainId.toString(),
      toChain: req.toChainId.toString(),
      fromToken: req.fromToken,
      toToken: req.toToken,
      fromAmount: req.amount,
    };

    if (req.slippageBps) {
      // Convert basis points to percentage
      params.slippage = (req.slippageBps / 10000).toString();
    }

    if (req.userAddress) {
      params.fromAddress = req.userAddress;
    }

    if (req.recipient) {
      params.toAddress = req.recipient;
    }

    return params;
  }

  /**
   * Build headers for LI.FI API requests
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['x-lifi-api-key'] = this.apiKey;
    }

    return headers;
  }

  /**
   * Parse LI.FI routes response
   */
  private parseRoutesResponse(response: any, req: RouteRequest): RouteQuote[] {
    const routes = Array.isArray(response.routes) ? response.routes : [response];

    return routes.map((route: any) => {
      const steps: Step[] = route.steps.map((step: any) => ({
        kind: this.getStepKind(step.type),
        chainId: step.action?.fromChainId || req.fromChainId,
        details: {
          tool: step.tool,
          action: step.action,
          estimate: step.estimate,
        },
        protocol: step.tool,
        estimatedTime: step.estimate?.executionDuration,
      }));

      return {
        steps,
        totalEstimatedOut: route.toAmount,
        fees: {
          gas: route.gasCosts?.[0]?.amount || '0',
          provider: route.fees?.[0]?.amount || '0',
        },
        etaSeconds: route.estimate?.executionDuration,
        routeId: route.id,
        priceImpact: route.estimate?.priceImpact,
        confidence: this.calculateConfidence(route),
        providerRef: {
          lifiRoute: route,
        },
      };
    });
  }

  /**
   * Parse LI.FI status response
   */
  private parseStatusResponse(response: any): ExecutionStatus {
    switch (response.status?.toLowerCase()) {
      case 'done':
      case 'success':
        return 'SUCCESS';
      case 'pending':
      case 'started':
        return 'PENDING';
      case 'failed':
      case 'invalid':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Get step kind from LI.FI step type
   */
  private getStepKind(stepType: string): 'swap' | 'bridge' | 'native' {
    if (stepType === 'cross') {
      return 'bridge';
    } else if (stepType === 'swap') {
      return 'swap';
    } else {
      return 'native';
    }
  }

  /**
   * Calculate route confidence based on various factors
   */
  private calculateConfidence(route: any): number {
    let confidence = 0.8; // Base confidence

    // Increase confidence for well-known tools
    const trustedTools = ['uniswap', 'paraswap', 'hop', 'across'];
    if (route.steps.some((step: any) => trustedTools.includes(step.tool))) {
      confidence += 0.1;
    }

    // Decrease confidence for high price impact
    if (route.estimate?.priceImpact > 5) {
      confidence -= 0.2;
    }

    // Decrease confidence for long execution time
    if (route.estimate?.executionDuration > 600) { // 10 minutes
      confidence -= 0.1;
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
          throw new Error(`Bad request: ${data?.message || 'Invalid parameters'}`);
        case 401:
          throw new Error('Unauthorized: Invalid API key');
        case 403:
          throw new Error('Forbidden: API key does not have required permissions');
        case 429:
          throw new Error('Rate limited: Too many requests');
        case 500:
          throw new Error('Internal server error: LI.FI API is experiencing issues');
        default:
          throw new Error(`API error (${status}): ${data?.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error('Network error: Unable to reach LI.FI API');
    } else {
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}