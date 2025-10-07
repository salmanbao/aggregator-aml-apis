import { Module } from '@nestjs/common';
import { SwapController } from './controllers/swap.controller';
import { QuoteService } from './services/quote.service';
import { SwapExecutionService } from './services/swap-execution.service';
import { ApprovalService } from './services/approval.service';
import { WalletService } from './services/wallet.service';
import { AggregatorManagerService } from './services/aggregator-manager.service';
import { ZeroXService } from './services/aggregators/zero-x.service';
import { OneInchService } from './services/aggregators/one-inch.service';
import { ParaSwapService } from './services/aggregators/paraswap.service';
import { CowService } from './services/aggregators/cow.service';

/**
 * Swap module that provides token swap functionality
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
    OneInchService,
    ParaSwapService,
    CowService,
  ],
  exports: [
    QuoteService,
    SwapExecutionService,
    ApprovalService,
    WalletService,
    AggregatorManagerService,
  ],
})
export class SwapModule {}
