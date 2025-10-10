import { Module } from '@nestjs/common';
import { SwapController } from './controllers/swap.controller';
import { QuoteService } from './services/quote.service';
import { SwapExecutionService } from './services/swap-execution.service';
import { ApprovalService } from './services/approval.service';
import { WalletService } from './services/wallet.service';
import { AggregatorManagerService } from './services/aggregator-manager.service';
import { ZeroXService } from './services/aggregators/zero-x.service';
import { Permit2Service } from './services/permit2.service';
import { Permit2WorkflowService } from './services/permit2-workflow.service';
import { TransactionParserService } from './services/transaction-parser.service';

/**
 * Swap module that provides token swap functionality using 0x Protocol v2
 */
@Module({
  controllers: [SwapController],
  providers: [
    QuoteService,
    SwapExecutionService,
    ApprovalService,
    WalletService,
    AggregatorManagerService,
    ZeroXService,
    Permit2Service,
    Permit2WorkflowService,
    TransactionParserService,
  ],
  exports: [
    QuoteService,
    SwapExecutionService,
    ApprovalService,
    WalletService,
    AggregatorManagerService,
    Permit2Service,
    Permit2WorkflowService,
    TransactionParserService,
  ],
})
export class SwapModule {}
