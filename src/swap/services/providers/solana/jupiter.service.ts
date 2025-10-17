import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { CustomHttpService } from '@shared/services/http.service';
import { 
  ISolanaRouter, 
  SolanaQuoteRequest, 
  RouteQuote, 
  SolanaTransactionResult,
  ProviderConfig,
  ProviderHealth,
  IProvider,
  Step 
} from '../../../models/ports';
import type { IAggregatorRegistry } from '@swap/services/core/aggregation/aggregator-registry.interface';
import { AggregatorManagerService } from '@swap/services/core/aggregation/aggregator-manager.service';

/**
 * Jupiter aggregator service implementing ISolanaRouter port
 * Provides Solana token swapping capabilities
 */
@Injectable()
export class JupiterService implements ISolanaRouter, IProvider, OnModuleInit {
  private readonly logger = new Logger(JupiterService.name);
  private readonly baseUrl = 'https://quote-api.jup.ag/v6';
  private readonly apiKey = process.env.JUPITER_API_KEY;

  constructor(
    private readonly httpService: CustomHttpService,
    @Optional() @Inject(AggregatorManagerService) private readonly registry?: IAggregatorRegistry
  ) {}

  /**
   * Self-register with AggregatorManagerService on module initialization
   */
  onModuleInit() {
    if (this.registry) {
      this.registry.registerSolanaRouter(this);
      this.logger.debug(`✅ ${this.getProviderName()} self-registered as Solana router`);
    } else {
      this.logger.warn(`⚠️ ${this.getProviderName()} could not find registry to self-register`);
    }
  }

  /**
   * Get provider name for identification
   */
  getProviderName(): string {
    return 'Jupiter';
  }

  /**
   * Get swap quote for Solana tokens
   */
  async quote(req: SolanaQuoteRequest): Promise<RouteQuote> {
    try {
      const url = `${this.baseUrl}/quote`;
      const params = this.buildQuoteParams(req);
      const headers = this.buildHeaders();

      this.logger.debug(`Getting Jupiter quote`, params);
      
      const queryParams = new URLSearchParams(params);
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 15000,
      });

      return this.parseQuoteResponse(response, req);
    } catch (error) {
      this.logger.error(`Failed to get Jupiter quote: ${error.message}`, error.stack);
      this.handleApiError(error);
      throw new Error(`Jupiter quote failed: ${error.message}`);
    }
  }

  /**
   * Build and optionally sign transaction
   */
  async buildAndSign(quoteResponse: any, userKeypair?: any): Promise<SolanaTransactionResult> {
    try {
      const url = `${this.baseUrl}/swap`;
      const headers = this.buildHeaders();

      const payload = {
        quoteResponse,
        userPublicKey: userKeypair?.publicKey?.toString() || quoteResponse.userPublicKey,
        wrapAndUnwrapSol: true,
      };

      this.logger.debug(`Building Jupiter transaction`);
      
      const response = await this.httpService.post<any>(url, payload, {
        headers,
        timeout: 15000,
      });

      return {
        rawTx: response.swapTransaction,
        instructions: response.instructions,
      };
    } catch (error) {
      this.logger.error(`Failed to build Jupiter transaction: ${error.message}`, error.stack);
      this.handleApiError(error);
      throw new Error(`Jupiter transaction build failed: ${error.message}`);
    }
  }

  /**
   * Check if token pair is supported
   */
  async supportsTokenPair(fromMint: string, toMint: string): Promise<boolean> {
    try {
      const tokens = await this.getTokenList();
      const supportedMints = new Set(tokens.map(token => token.address));
      
      return supportedMints.has(fromMint) && supportedMints.has(toMint);
    } catch (error) {
      this.logger.error(`Failed to check Jupiter token pair support: ${error.message}`);
      return false;
    }
  }

  /**
   * Provider health check
   */
  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      // Use a simple quote request for health check
      const url = `${this.baseUrl}/quote`;
      const params = {
        inputMint: 'So11111111111111111111111111111111111111112', // Wrapped SOL
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        amount: '1000000', // 0.001 SOL
        slippageBps: '50',
      };
      
      const queryParams = new URLSearchParams(params);
      await this.httpService.get(`${url}?${queryParams.toString()}`, {
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
        requests: 10,
        perSeconds: 1,
      },
      timeout: 15000,
      retries: 3,
    };
  }

  /**
   * Get list of supported tokens
   */
  async getTokenList(): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/tokens`;
      const headers = this.buildHeaders();

      const response = await this.httpService.get<any[]>(url, {
        headers,
        timeout: 10000,
      });

      return response || [];
    } catch (error) {
      this.logger.error(`Failed to get Jupiter token list: ${error.message}`);
      throw new Error(`Failed to get Jupiter token list: ${error.message}`);
    }
  }

  /**
   * Get price for a token pair
   */
  async getPrice(inputMint: string, outputMint: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/price`;
      const params = {
        ids: inputMint,
        vsToken: outputMint,
      };
      const headers = this.buildHeaders();

      const queryParams = new URLSearchParams(params);
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 10000,
      });

      return response;
    } catch (error) {
      this.logger.error(`Failed to get Jupiter price: ${error.message}`);
      throw new Error(`Failed to get Jupiter price: ${error.message}`);
    }
  }

  /**
   * Build quote parameters for Jupiter API
   */
  private buildQuoteParams(req: SolanaQuoteRequest): Record<string, string> {
    const params: Record<string, string> = {
      inputMint: req.fromMint,
      outputMint: req.toMint,
      amount: req.amount,
      slippageBps: req.slippageBps.toString(),
    };

    if (req.userPublicKey) {
      params.userPublicKey = req.userPublicKey;
    }

    if (req.platformFeeBps) {
      params.platformFeeBps = req.platformFeeBps.toString();
    }

    return params;
  }

  /**
   * Build headers for Jupiter API requests
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Parse Jupiter quote response
   */
  private parseQuoteResponse(response: any, req: SolanaQuoteRequest): RouteQuote {
    const steps: Step[] = [{
      kind: 'swap',
      chainId: 101, // Solana mainnet
      details: {
        routePlan: response.routePlan,
        contextSlot: response.contextSlot,
        timeTaken: response.timeTaken,
      },
      protocol: 'Jupiter',
    }];

    // Extract route information
    const routes = response.routePlan || [];
    if (routes.length > 0) {
      routes.forEach((route: any, index: number) => {
        if (index > 0) { // Skip first as it's already added
          steps.push({
            kind: 'swap',
            chainId: 101,
            details: route,
            protocol: route.swapInfo?.ammKey || 'Jupiter',
          });
        }
      });
    }

    return {
      steps,
      totalEstimatedOut: response.outAmount,
      fees: {
        gas: '5000', // Typical Solana transaction fee in lamports
        provider: response.platformFee?.amount || '0',
      },
      etaSeconds: 30, // Solana is fast
      routeId: `jupiter_${Date.now()}`,
      priceImpact: response.priceImpactPct,
      confidence: this.calculateConfidence(response),
      providerRef: {
        jupiterQuote: response,
      },
    };
  }

  /**
   * Calculate route confidence based on various factors
   */
  private calculateConfidence(response: any): number {
    let confidence = 0.9; // Base confidence for Jupiter

    // Decrease confidence for high price impact
    if (response.priceImpactPct > 5) {
      confidence -= 0.2;
    }

    // Decrease confidence for complex routes (many hops)
    const hopCount = response.routePlan?.length || 1;
    if (hopCount > 3) {
      confidence -= 0.1 * (hopCount - 3);
    }

    // Increase confidence for direct routes
    if (hopCount === 1) {
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
        case 401:
          throw new Error('Unauthorized: Invalid API key');
        case 403:
          throw new Error('Forbidden: API key does not have required permissions');
        case 429:
          throw new Error('Rate limited: Too many requests');
        case 500:
          throw new Error('Internal server error: Jupiter API is experiencing issues');
        default:
          throw new Error(`API error (${status}): ${data?.error || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error('Network error: Unable to reach Jupiter API');
    } else {
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}