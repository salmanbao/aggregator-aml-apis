import { Module, OnModuleInit } from '@nestjs/common';
import { UniversalSwapController } from './controllers/universal-swap.controller';
import { SwapAnalysisController } from './controllers/swap-analysis.controller';
import { QuoteService } from './services/core/execution/quote.service';
import { SwapExecutionService } from './services/core/execution/swap-execution.service';
import { SwapRoutingService } from './services/core/swap-routing.service';
import { SwapCacheService } from './services/core/swap-cache.service';
import { ApprovalService } from './services/blockchain/approval/approval.service';
import { WalletService } from './services/blockchain/wallet/wallet.service';
import { EvmWalletProvider } from './services/blockchain/wallet/providers/evm-wallet.provider';
import { SolanaWalletProvider } from './services/blockchain/wallet/providers/solana-wallet.provider';
import { BitcoinWalletProvider } from './services/blockchain/wallet/providers/bitcoin-wallet.provider';
import { AggregatorManagerService } from './services/core/aggregation/aggregator-manager.service';
import { Permit2Service } from './services/blockchain/approval/permit2.service';
import { Permit2WorkflowService } from './services/blockchain/approval/permit2-workflow.service';
import { TransactionParserService } from './services/blockchain/analysis/transaction-parser.service';

// Provider imports
import { ZeroXService } from './services/providers/evm-aggregators/zero-x.service';
import { OdosService } from './services/providers/evm-aggregators/odos.service';

import { LiFiService } from './services/providers/meta/lifi.service';
import { SocketService } from './services/providers/meta/socket.service';
import { RangoService } from './services/providers/meta/rango.service';
import { RouterService } from './services/providers/meta/router.service';

import { JupiterService } from './services/providers/solana/jupiter.service';
import { OrcaService } from './services/providers/solana/orca.service';
import { RaydiumService } from './services/providers/solana/raydium.service';

import { ThorChainService } from './services/providers/native-l1/thorchain.service';
import { MayaService } from './services/providers/native-l1/maya.service';

/**
 * Unified swap module with universal swap architecture
 * Supports all swap types: on-chain, cross-chain, L1-L2, and native L1
 * Intelligent routing across EVM, Solana, Cosmos, Bitcoin, and THORChain ecosystems
 */
@Module({
  controllers: [
    UniversalSwapController,
    SwapAnalysisController,
  ],
  providers: [
    // Core services
    QuoteService,
    SwapExecutionService,
    SwapRoutingService,
    SwapCacheService,
    ApprovalService,
    WalletService,
    EvmWalletProvider,
    SolanaWalletProvider,
    BitcoinWalletProvider,
    Permit2Service,
    Permit2WorkflowService,
    TransactionParserService,
    
    // Unified aggregator manager (legacy + enhanced functionality)
    AggregatorManagerService,
    
    // EVM Aggregator providers (implemented)
    ZeroXService,
    OdosService,
    
    // Meta aggregator providers (implemented + stubs)
    LiFiService,
    SocketService,
    RangoService,
    RouterService,
    
    // Solana router providers (implemented + stubs)
    JupiterService,
    OrcaService,
    RaydiumService,
    
    // Native L1 router providers (implemented + stubs)
    ThorChainService,
    MayaService,
  ],
  exports: [
    // Core services
    QuoteService,
    SwapExecutionService,
    SwapRoutingService,
    SwapCacheService,
    ApprovalService,
    WalletService,
    Permit2Service,
    Permit2WorkflowService,
    TransactionParserService,
    
    // Unified aggregator manager
    AggregatorManagerService,
    
    // All provider services
    ZeroXService,
    OdosService,
    LiFiService,
    SocketService,
    RangoService,
    RouterService,
    JupiterService,
    OrcaService,
    RaydiumService,
    ThorChainService,
    MayaService,
  ],
})
export class SwapModule implements OnModuleInit {
  constructor(
    private readonly swapRoutingService: SwapRoutingService,
    private readonly aggregatorManager: AggregatorManagerService,
    private readonly walletService: WalletService,
    private readonly zeroXService: ZeroXService,
    private readonly odosService: OdosService,
    private readonly lifiService: LiFiService,
    private readonly socketService: SocketService,
    private readonly rangoService: RangoService,
    private readonly routerService: RouterService,
    private readonly jupiterService: JupiterService,
    private readonly orcaService: OrcaService,
    private readonly raydiumService: RaydiumService,
    private readonly thorChainService: ThorChainService,
    private readonly mayaService: MayaService,
  ) {}

  onModuleInit() {
    // Initialize provider registry for chain support validation
    const allProviders = [
      this.zeroXService,
      this.odosService,
      this.lifiService,
      this.socketService,
      this.rangoService,
      this.routerService,
      this.jupiterService,
      this.orcaService,
      this.raydiumService,
      this.thorChainService,
      this.mayaService,
    ];
    
    this.swapRoutingService.setProviderRegistry(allProviders);
    
    // Notify aggregator manager that all providers are loaded
    this.aggregatorManager.onRegistrationComplete();
    
    // Notify wallet service that all wallet providers are loaded
    this.walletService.onRegistrationComplete();
  }
}
