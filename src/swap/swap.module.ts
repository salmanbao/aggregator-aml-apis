import { Module } from '@nestjs/common';
import { SwapController } from './controllers/swap.controller';
import { EnhancedSwapController } from './controllers/enhanced-swap.controller';
import { QuoteService } from './services/core/execution/quote.service';
import { SwapExecutionService } from './services/core/execution/swap-execution.service';
import { ApprovalService } from './services/blockchain/approval/approval.service';
import { WalletService } from './services/blockchain/wallet/wallet.service';
import { AggregatorManagerService } from './services/core/aggregation/aggregator-manager.service';
import { EnhancedAggregatorManagerService } from './services/core/aggregation/enhanced-aggregator-manager.service';
import { Permit2Service } from './services/blockchain/approval/permit2.service';
import { Permit2WorkflowService } from './services/blockchain/approval/permit2-workflow.service';
import { TransactionParserService } from './services/blockchain/analysis/transaction-parser.service';

// Provider imports
import { ZeroXService } from './services/providers/evm-aggregators/zero-x.service';
import { OneInchService } from './services/providers/evm-aggregators/oneinch.service';
import { LiFiService } from './services/providers/meta/lifi.service';
import { JupiterService } from './services/providers/solana/jupiter.service';
import { ThorChainService } from './services/providers/native-l1/thorchain.service';

/**
 * Swap module with enhanced provider architecture
 * Supports EVM aggregators, meta aggregators, Solana routers, and native L1 routers
 */
@Module({
  controllers: [SwapController, EnhancedSwapController],
  providers: [
    // Core services
    QuoteService,
    SwapExecutionService,
    ApprovalService,
    WalletService,
    Permit2Service,
    Permit2WorkflowService,
    TransactionParserService,
    
    // Aggregator managers (both legacy and enhanced)
    AggregatorManagerService,
    EnhancedAggregatorManagerService,
    
    // EVM Aggregator providers
    ZeroXService,
    OneInchService,
    
    // Meta aggregator providers  
    LiFiService,
    
    // Solana router providers
    JupiterService,
    
    // Native L1 router providers
    ThorChainService,
  ],
  exports: [
    // Core services
    QuoteService,
    SwapExecutionService,
    ApprovalService,
    WalletService,
    Permit2Service,
    Permit2WorkflowService,
    TransactionParserService,
    
    // Aggregator managers
    AggregatorManagerService,
    EnhancedAggregatorManagerService,
    
    // Provider services
    ZeroXService,
    OneInchService,
    LiFiService,
    JupiterService,
    ThorChainService,
  ],
})
export class SwapModule {}
