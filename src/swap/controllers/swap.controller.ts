import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { QuoteService } from '../services/quote.service';
import { SwapExecutionService } from '../services/swap-execution.service';
import { ApprovalService } from '../services/approval.service';
import { WalletService } from '../services/wallet.service';
import { SwapQuoteRequestDto, SwapExecutionRequestDto } from '../dto/swap-request.dto';
import { ApprovalRequestDto, ApprovalStatusRequestDto } from '../dto/approval-request.dto';
import { BalanceRequestDto, MultiBalanceRequestDto } from '../dto/balance-request.dto';
import { SwapQuote, SwapResult, AggregatorType } from '../models/swap-request.model';

/**
 * Swap controller for handling token swap operations
 */
@ApiTags('Swap')
@Controller('swap')
export class SwapController {
  private readonly logger = new Logger(SwapController.name);

  constructor(
    private readonly quoteService: QuoteService,
    private readonly swapExecutionService: SwapExecutionService,
    private readonly approvalService: ApprovalService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Get swap quote
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get swap quote from aggregators' })
  @ApiResponse({
    status: 200,
    description: 'Swap quote retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            sellToken: { type: 'string' },
            buyToken: { type: 'string' },
            sellAmount: { type: 'string' },
            buyAmount: { type: 'string' },
            minBuyAmount: { type: 'string' },
            gas: { type: 'string' },
            gasPrice: { type: 'string' },
            to: { type: 'string' },
            data: { type: 'string' },
            value: { type: 'string' },
            allowanceTarget: { type: 'string' },
            aggregator: { type: 'string' },
            priceImpact: { type: 'string' },
            estimatedGas: { type: 'string' },
          },
        },
        timestamp: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getQuote(@Body() request: SwapQuoteRequestDto): Promise<SwapQuote> {
    this.logger.log(`Getting quote for ${request.sellToken} -> ${request.buyToken}`);
    return await this.quoteService.getQuote(
      request.chainId,
      request.sellToken,
      request.buyToken,
      request.sellAmount,
      request.taker,
      request.recipient,
      request.slippagePercentage,
      request.deadline,
      request.aggregator,
    );
  }

  /**
   * Get multiple quotes from different aggregators
   */
  @Post('quotes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get quotes from multiple aggregators' })
  @ApiResponse({
    status: 200,
    description: 'Multiple quotes retrieved successfully',
  })
  async getMultipleQuotes(@Body() request: SwapQuoteRequestDto): Promise<Array<{ aggregator: AggregatorType; quote: SwapQuote }>> {
    this.logger.log(`Getting multiple quotes for ${request.sellToken} -> ${request.buyToken}`);
    
    return await this.quoteService.getMultipleQuotes(
      request.chainId,
      request.sellToken,
      request.buyToken,
      request.sellAmount,
      request.taker,
      request.recipient,
      request.slippagePercentage,
      request.deadline,
    );
  }

  /**
   * Get best quote from all aggregators
   */
  @Post('best-quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get best quote from all aggregators' })
  @ApiResponse({
    status: 200,
    description: 'Best quote retrieved successfully',
  })
  async getBestQuote(@Body() request: SwapQuoteRequestDto): Promise<{ aggregator: AggregatorType; quote: SwapQuote }> {
    this.logger.log(`Getting best quote for ${request.sellToken} -> ${request.buyToken}`);
    
    return await this.quoteService.getBestQuote(
      request.chainId,
      request.sellToken,
      request.buyToken,
      request.sellAmount,
      request.taker,
      request.recipient,
      request.slippagePercentage,
      request.deadline,
    );
  }

  /**
   * Compare quotes from different aggregators
   */
  @Post('compare-quotes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compare quotes from different aggregators' })
  @ApiResponse({
    status: 200,
    description: 'Quote comparison completed successfully',
  })
  async compareQuotes(@Body() request: SwapQuoteRequestDto): Promise<{
    quotes: Array<{ aggregator: AggregatorType; quote: SwapQuote }>;
    bestAggregator: AggregatorType;
    priceDifference: string;
  }> {
    this.logger.log(`Comparing quotes for ${request.sellToken} -> ${request.buyToken}`);
    
    return await this.quoteService.compareQuotes(
      request.chainId,
      request.sellToken,
      request.buyToken,
      request.sellAmount,
      request.taker,
      request.recipient,
      request.slippagePercentage,
      request.deadline,
    );
  }

  /**
   * Execute swap
   */
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute token swap' })
  @ApiResponse({
    status: 200,
    description: 'Swap executed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            transactionHash: { type: 'string' },
            sellToken: { type: 'string' },
            buyToken: { type: 'string' },
            sellAmount: { type: 'string' },
            buyAmount: { type: 'string' },
            gasUsed: { type: 'string' },
            gasPrice: { type: 'string' },
            aggregator: { type: 'string' },
            timestamp: { type: 'number' },
          },
        },
        timestamp: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async executeSwap(@Body() request: SwapExecutionRequestDto): Promise<SwapResult> {
    this.logger.log(`Executing swap for ${request.sellToken} -> ${request.buyToken}`);
    
    return await this.swapExecutionService.executeSwap(
      request.chainId,
      request.privateKey,
      request.sellToken,
      request.buyToken,
      request.sellAmount,
      request.recipient,
      request.slippagePercentage,
      request.deadline,
      request.aggregator,
    );
  }

  /**
   * Get wallet balance
   */
  @Post('balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get wallet balance for a token' })
  @ApiResponse({
    status: 200,
    description: 'Balance retrieved successfully',
  })
  async getBalance(@Body() request: BalanceRequestDto) {
    this.logger.log(`Getting balance for wallet ${request.walletAddress}`);
    
    return await this.walletService.getBalance(
      request.chainId,
      request.walletAddress,
      request.tokenAddress,
    );
  }

  /**
   * Get multiple token balances
   */
  @Post('balances')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get multiple token balances for a wallet' })
  @ApiResponse({
    status: 200,
    description: 'Balances retrieved successfully',
  })
  async getMultipleBalances(@Body() request: MultiBalanceRequestDto) {
    this.logger.log(`Getting multiple balances for wallet ${request.walletAddress}`);
    
    return await this.walletService.getMultipleBalances(
      request.chainId,
      request.walletAddress,
      request.tokenAddresses,
    );
  }

  /**
   * Check approval status
   */
  @Post('approval/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check token approval status' })
  @ApiResponse({
    status: 200,
    description: 'Approval status retrieved successfully',
  })
  async getApprovalStatus(@Body() request: ApprovalStatusRequestDto) {
    this.logger.log(`Checking approval status for token ${request.tokenAddress}`);
    
    return await this.approvalService.getApprovalStatus(
      request.chainId,
      request.tokenAddress,
      request.owner,
      request.spender,
    );
  }

  /**
   * Execute approval transaction
   */
  @Post('approval/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute token approval transaction' })
  @ApiResponse({
    status: 200,
    description: 'Approval executed successfully',
  })
  async executeApproval(@Body() request: ApprovalRequestDto) {
    this.logger.log(`Executing approval for token ${request.tokenAddress}`);
    
    return await this.approvalService.executeApproval(
      request.chainId,
      request.privateKey,
      request.tokenAddress,
      request.spender,
      request.amount,
    );
  }

  /**
   * Get supported aggregators for a chain
   */
  @Get('aggregators')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get supported aggregators for a chain' })
  @ApiQuery({ name: 'chainId', description: 'Chain ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Supported aggregators retrieved successfully',
  })
  async getSupportedAggregators(@Query('chainId', ParseIntPipe) chainId: number): Promise<AggregatorType[]> {
    this.logger.log(`Getting supported aggregators for chain ${chainId}`);

    return this.quoteService.getSupportedAggregators(chainId);
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check for swap service' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
