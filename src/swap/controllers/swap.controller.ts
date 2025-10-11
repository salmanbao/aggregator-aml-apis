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
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { QuoteService } from '@swap/services/core/execution/quote.service';
import { SwapExecutionService } from '@swap/services/core/execution/swap-execution.service';
import { ApprovalService } from '@swap/services/blockchain/approval/approval.service';
import { WalletService } from '@swap/services/blockchain/wallet/wallet.service';
import { TransactionParserService } from '@swap/services/blockchain/analysis/transaction-parser.service';
import { Permit2WorkflowService } from '@swap/services/blockchain/approval/permit2-workflow.service';
import { SwapQuoteRequestDto, SwapExecutionRequestDto } from '../dto/swap-request.dto';
import { ApprovalRequestDto, ApprovalStatusRequestDto } from '../dto/approval-request.dto';
import { BalanceRequestDto, MultiBalanceRequestDto } from '../dto/balance-request.dto';
import { TransactionParseRequestDto, TransactionParseResponseDto } from '../dto/transaction-parse-request.dto';
import { Permit2InfoRequestDto } from '../dto/permit2-info-request.dto';
import { AllowanceHolderExecuteRequestDto } from '../dto/allowance-holder-execute-request.dto';
import type { SwapQuote, SwapResult } from '../models/swap-request.model';
import { AggregatorType, ApprovalStrategy } from '../models/swap-request.model';

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
    private readonly transactionParserService: TransactionParserService,
    private readonly permit2WorkflowService: Permit2WorkflowService,
  ) {}

  /**
   * Handle quote-related errors with appropriate HTTP exceptions
   */
  private handleQuoteError(error: any, operation: string): never {
    this.logger.error(`Failed to ${operation}: ${error.message}`, error.stack);
    
    // Check if it's already a proper HTTP exception
    if (error instanceof BadRequestException) {
      throw error;
    }
    
    // Transform specific errors into appropriate HTTP exceptions
    if (error.message.includes('Invalid chain ID') || error.message.includes('Unsupported chain')) {
      throw new BadRequestException({
        message: 'Invalid or unsupported chain ID.',
        error: 'InvalidChainId',
        details: 'The provided chain ID is not supported by the service.'
      });
    } else if (error.message.includes('Invalid token address')) {
      throw new BadRequestException({
        message: 'Invalid token address provided.',
        error: 'InvalidTokenAddress',
        details: 'One or both token addresses are invalid or do not exist on this chain.'
      });
    } else if (error.message.includes('Invalid amount')) {
      throw new BadRequestException({
        message: 'Invalid sell amount provided.',
        error: 'InvalidAmount',
        details: 'The sell amount must be a positive number in wei format.'
      });
    } else if (error.message.includes('Invalid wallet address')) {
      throw new BadRequestException({
        message: 'Invalid wallet address provided.',
        error: 'InvalidWalletAddress',
        details: 'The taker or recipient address is not a valid Ethereum address.'
      });
    } else if (error.message.includes('No liquidity') || error.message.includes('insufficient liquidity')) {
      throw new BadRequestException({
        message: 'Insufficient liquidity for this trade.',
        error: 'InsufficientLiquidity',
        details: 'There is not enough liquidity available for this token pair and amount.'
      });
    } else if (error.message.includes('Rate limit') || error.message.includes('rate limit')) {
      throw new ServiceUnavailableException({
        message: 'Rate limit exceeded. Please try again later.',
        error: 'RateLimitExceeded',
        details: 'Too many requests have been made. Please wait before trying again.'
      });
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      throw new ServiceUnavailableException({
        message: 'Network error occurred while fetching quote.',
        error: 'NetworkError',
        details: 'There was a network connectivity issue. Please try again.'
      });
    } else {
      throw new InternalServerErrorException({
        message: `Failed to ${operation}. Please try again.`,
        error: 'QuoteServiceError',
        details: 'An unexpected error occurred while processing the request.'
      });
    }
  }

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
    
    try {
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
    } catch (error) {
      this.handleQuoteError(error, 'get quote');
    }
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
    
    try {
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
    } catch (error) {
      this.handleQuoteError(error, 'get multiple quotes');
    }
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
    
    try {
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
    } catch (error) {
      this.handleQuoteError(error, 'get best quote');
    }
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
    
    try {
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
    } catch (error) {
      this.handleQuoteError(error, 'compare quotes');
    }
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
    
    try {
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
    } catch (error) {
      this.logger.error(`Failed to execute swap: ${error.message}`, error.stack);
      
      // Transform specific errors into appropriate HTTP exceptions
      if (error.message.includes('Insufficient funds') || error.message.includes('Insufficient balance')) {
        throw new BadRequestException({
          message: 'Insufficient funds for transaction. Please check your wallet balance.',
          error: 'InsufficientFunds',
          details: 'The wallet does not have enough balance to cover the transaction amount and gas fees.'
        });
      } else if (error.message.includes('Gas estimation failed')) {
        throw new BadRequestException({
          message: 'Gas estimation failed. The transaction may fail or gas limit may be too low.',
          error: 'GasEstimationFailed',
          details: 'Unable to estimate gas for the transaction. Please check transaction parameters.'
        });
      } else if (error.message.includes('Invalid private key')) {
        throw new BadRequestException({
          message: 'Invalid private key provided.',
          error: 'InvalidPrivateKey',
          details: 'The provided private key is not valid or properly formatted.'
        });
      } else if (error.message.includes('slippage tolerance exceeded')) {
        throw new BadRequestException({
          message: 'Transaction failed due to slippage tolerance exceeded.',
          error: 'SlippageExceeded',
          details: 'The price moved beyond your slippage tolerance. Try increasing slippage or retry.'
        });
      } else if (error.message.includes('deadline exceeded')) {
        throw new BadRequestException({
          message: 'Transaction deadline exceeded.',
          error: 'DeadlineExceeded',
          details: 'The transaction took too long to process and exceeded the deadline.'
        });
      } else if (error.message.includes('network')) {
        throw new ServiceUnavailableException({
          message: 'Network error occurred during transaction.',
          error: 'NetworkError',
          details: 'There was a network connectivity issue. Please try again.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Swap execution failed. Please try again.',
          error: 'SwapExecutionFailed',
          details: 'An unexpected error occurred during swap execution.'
        });
      }
    }
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
    
    try {
      return await this.walletService.getBalance(
        request.chainId,
        request.walletAddress,
        request.tokenAddress,
      );
    } catch (error) {
      this.logger.error(`Failed to get balance: ${error.message}`, error.stack);
      
      if (error.message.includes('Invalid wallet address')) {
        throw new BadRequestException({
          message: 'Invalid wallet address provided.',
          error: 'InvalidWalletAddress',
          details: 'The provided wallet address is not a valid Ethereum address.'
        });
      } else if (error.message.includes('Invalid token address')) {
        throw new BadRequestException({
          message: 'Invalid token address provided.',
          error: 'InvalidTokenAddress',
          details: 'The provided token address is not valid or does not exist on this chain.'
        });
      } else if (error.message.includes('network')) {
        throw new ServiceUnavailableException({
          message: 'Network error occurred while fetching balance.',
          error: 'NetworkError',
          details: 'There was a network connectivity issue. Please try again.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to get balance. Please try again.',
          error: 'BalanceServiceError',
          details: 'An unexpected error occurred while fetching the balance.'
        });
      }
    }
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
    
    try {
      return await this.walletService.getMultipleBalances(
        request.chainId,
        request.walletAddress,
        request.tokenAddresses,
      );
    } catch (error) {
      this.logger.error(`Failed to get multiple balances: ${error.message}`, error.stack);
      
      if (error.message.includes('Invalid wallet address')) {
        throw new BadRequestException({
          message: 'Invalid wallet address provided.',
          error: 'InvalidWalletAddress',
          details: 'The provided wallet address is not a valid Ethereum address.'
        });
      } else if (error.message.includes('Invalid token address')) {
        throw new BadRequestException({
          message: 'One or more token addresses are invalid.',
          error: 'InvalidTokenAddress',
          details: 'One or more of the provided token addresses are not valid or do not exist on this chain.'
        });
      } else if (error.message.includes('network')) {
        throw new ServiceUnavailableException({
          message: 'Network error occurred while fetching balances.',
          error: 'NetworkError',
          details: 'There was a network connectivity issue. Please try again.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to get balances. Please try again.',
          error: 'BalanceServiceError',
          details: 'An unexpected error occurred while fetching the balances.'
        });
      }
    }
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
    
    try {
      return await this.approvalService.getApprovalStatus(
        request.chainId,
        request.tokenAddress,
        request.owner,
        request.spender,
        request.amount,
      );
    } catch (error) {
      this.logger.error(`Failed to get approval status: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      if (error.message.includes('Invalid token address')) {
        throw new BadRequestException({
          message: 'Invalid token address provided.',
          error: 'InvalidTokenAddress',
          details: 'The provided token address is not valid or does not exist on this chain.'
        });
      } else if (error.message.includes('Invalid wallet address')) {
        throw new BadRequestException({
          message: 'Invalid wallet address provided.',
          error: 'InvalidWalletAddress',
          details: 'The owner or spender address is not a valid Ethereum address.'
        });
      } else if (error.message.includes('network')) {
        throw new ServiceUnavailableException({
          message: 'Network error occurred while checking approval.',
          error: 'NetworkError',
          details: 'There was a network connectivity issue. Please try again.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to check approval status. Please try again.',
          error: 'ApprovalServiceError',
          details: 'An unexpected error occurred while checking approval status.'
        });
      }
    }
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
    
    try {
      return await this.approvalService.executeApproval(
        request.chainId,
        request.privateKey,
        request.tokenAddress,
        request.spender,
        request.amount,
      );
    } catch (error) {
      this.logger.error(`Failed to execute approval: ${error.message}`, error.stack);
      
      // Transform specific errors into appropriate HTTP exceptions
      if (error.message.includes('Insufficient funds') || error.message.includes('Insufficient balance')) {
        throw new BadRequestException({
          message: 'Insufficient funds for approval transaction. Please check your wallet balance.',
          error: 'InsufficientFunds',
          details: 'The wallet does not have enough balance to cover the approval transaction gas fees.'
        });
      } else if (error.message.includes('Invalid private key')) {
        throw new BadRequestException({
          message: 'Invalid private key provided.',
          error: 'InvalidPrivateKey',
          details: 'The provided private key is not valid or properly formatted.'
        });
      } else if (error.message.includes('Invalid token address')) {
        throw new BadRequestException({
          message: 'Invalid token address provided.',
          error: 'InvalidTokenAddress',
          details: 'The provided token address is not valid or does not exist on this chain.'
        });
      } else if (error.message.includes('Gas estimation failed')) {
        throw new BadRequestException({
          message: 'Gas estimation failed for approval transaction.',
          error: 'GasEstimationFailed',
          details: 'Unable to estimate gas for the approval transaction.'
        });
      } else if (error.message.includes('network')) {
        throw new ServiceUnavailableException({
          message: 'Network error occurred during approval.',
          error: 'NetworkError',
          details: 'There was a network connectivity issue. Please try again.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Approval execution failed. Please try again.',
          error: 'ApprovalExecutionFailed',
          details: 'An unexpected error occurred during approval execution.'
        });
      }
    }
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

    try {
      return this.quoteService.getSupportedAggregators(chainId);
    } catch (error) {
      this.logger.error(`Failed to get supported aggregators: ${error.message}`, error.stack);
      
      if (error.message.includes('Invalid chain ID') || error.message.includes('Unsupported chain')) {
        throw new BadRequestException({
          message: 'Invalid or unsupported chain ID.',
          error: 'InvalidChainId',
          details: 'The provided chain ID is not supported by the service.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to get supported aggregators. Please try again.',
          error: 'AggregatorServiceError',
          details: 'An unexpected error occurred while fetching supported aggregators.'
        });
      }
    }
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

  /**
   * Parse transaction and extract swap information
   */
  @Post('parse-transaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Parse transaction and extract swap information',
    description: 'Fetch transaction data from blockchain and parse it using 0x parser to extract readable swap information'
  })
  @ApiBody({
    type: TransactionParseRequestDto,
    description: 'Transaction hash and optional chain ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully parsed transaction',
    type: TransactionParseResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or transaction hash',
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
  })
  async parseTransaction(
    @Body() request: TransactionParseRequestDto,
  ): Promise<TransactionParseResponseDto> {
    this.logger.log(`Parsing transaction: ${request.transactionHash} on chain: ${request.chainId || 1}`);
    
    try {
      return await this.transactionParserService.parseTransaction(request);
    } catch (error) {
      this.logger.error(`Failed to parse transaction: ${error.message}`, error.stack);
      
      // TransactionParserService already throws proper HTTP exceptions
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      
      throw new InternalServerErrorException({
        message: 'Failed to parse transaction. Please try again.',
        error: 'TransactionParseError',
        details: 'An unexpected error occurred while parsing the transaction.'
      });
    }
  }

  /**
   * Get allowance-holder quote with single signature approval (Recommended)
   */
  @Post('allowance-holder/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get AllowanceHolder quote with single signature approval',
    description: 'Get swap quote from 0x Protocol v2 using AllowanceHolder strategy. This is the recommended approach with single signature approval, better UX, and lower gas costs compared to Permit2.'
  })
  @ApiResponse({
    status: 200,
    description: 'AllowanceHolder quote retrieved successfully',
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
            approvalStrategy: { type: 'string', enum: ['allowance-holder'] },
          },
        },
        timestamp: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAllowanceHolderQuote(@Body() request: SwapQuoteRequestDto): Promise<SwapQuote> {
    this.logger.log(`Getting AllowanceHolder quote for ${request.sellToken} -> ${request.buyToken}`);
    
    try {
      // Force aggregator to 0x and set AllowanceHolder strategy
      const allowanceHolderRequest = { 
        ...request, 
        aggregator: AggregatorType.ZEROX,
        approvalStrategy: ApprovalStrategy.ALLOWANCE_HOLDER
      };
      
      return await this.quoteService.getQuote(
        allowanceHolderRequest.chainId,
        allowanceHolderRequest.sellToken,
        allowanceHolderRequest.buyToken,
        allowanceHolderRequest.sellAmount,
        allowanceHolderRequest.taker,
        allowanceHolderRequest.recipient,
        allowanceHolderRequest.slippagePercentage,
        allowanceHolderRequest.deadline,
        allowanceHolderRequest.aggregator,
        allowanceHolderRequest.approvalStrategy,
      );
    } catch (error) {
      this.handleQuoteError(error, 'get AllowanceHolder quote');
    }
  }

  /**
   * Get allowance-holder price (indicative pricing without transaction data)
   */
  @Post('allowance-holder/price')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get AllowanceHolder price quote',
    description: 'Get indicative price from 0x Protocol v2 using AllowanceHolder strategy without transaction data. Use this for price discovery before committing to a trade.'
  })
  @ApiResponse({
    status: 200,
    description: 'AllowanceHolder price retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        sellToken: { type: 'string' },
        buyToken: { type: 'string' },
        sellAmount: { type: 'string' },
        buyAmount: { type: 'string' },
        price: { type: 'string' },
        priceImpact: { type: 'string' },
        sources: { type: 'array' },
        allowanceTarget: { type: 'string' },
        approvalStrategy: { type: 'string', enum: ['allowance-holder'] },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAllowanceHolderPrice(@Body() request: SwapQuoteRequestDto): Promise<any> {
    this.logger.log(`Getting AllowanceHolder price for ${request.sellToken} -> ${request.buyToken}`);
    
    try {
      // Force aggregator to 0x and set AllowanceHolder strategy
      const allowanceHolderRequest = { 
        ...request, 
        aggregator: AggregatorType.ZEROX,
        approvalStrategy: ApprovalStrategy.ALLOWANCE_HOLDER
      };
      
      return await this.quoteService.getPrice(
        allowanceHolderRequest.chainId,
        allowanceHolderRequest.sellToken,
        allowanceHolderRequest.buyToken,
        allowanceHolderRequest.sellAmount,
        allowanceHolderRequest.taker,
        allowanceHolderRequest.recipient,
        allowanceHolderRequest.slippagePercentage,
        allowanceHolderRequest.deadline,
        allowanceHolderRequest.aggregator,
        allowanceHolderRequest.approvalStrategy,
      );
    } catch (error) {
      this.handleQuoteError(error, 'get AllowanceHolder price');
    }
  }

  /**
   * Execute AllowanceHolder swap transaction (Recommended)
   */
  @Post('allowance-holder/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Execute AllowanceHolder swap transaction',
    description: 'Execute a swap transaction using the transaction data from allowance-holder/quote endpoint. This follows the single-signature approval flow recommended by 0x Protocol v2.'
  })
  @ApiResponse({
    status: 200,
    description: 'AllowanceHolder swap executed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            transactionHash: { type: 'string' },
            chainId: { type: 'number' },
            from: { type: 'string' },
            to: { type: 'string' },
            value: { type: 'string' },
            gasUsed: { type: 'string' },
            gasPrice: { type: 'string' },
            status: { type: 'string' },
            blockNumber: { type: 'number' },
            blockHash: { type: 'string' },
            sellToken: { type: 'string' },
            buyToken: { type: 'string' },
            sellAmount: { type: 'string' },
            buyAmount: { type: 'string' },
            strategy: { type: 'string', enum: ['allowance-holder'] },
          },
        },
        timestamp: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid transaction data or insufficient funds' })
  @ApiResponse({ status: 500, description: 'Internal server error - Transaction execution failed' })
  async executeAllowanceHolderSwap(@Body() request: AllowanceHolderExecuteRequestDto): Promise<{
    success: boolean;
    data: {
      transactionHash: string;
      chainId: number;
      from: string;
      to: string;
      value: string;
      gasUsed?: string;
      gasPrice?: string;
      status: string;
      blockNumber?: number;
      blockHash?: string;
      sellToken?: string;
      buyToken?: string;
      sellAmount?: string;
      buyAmount?: string;
      strategy: string;
    };
    timestamp: string;
  }> {
    this.logger.log(`Executing AllowanceHolder swap transaction on chain ${request.chainId}`);
    
    try {
      // Execute the swap transaction using the swap execution service
      const result = await this.swapExecutionService.executeAllowanceHolderSwap(
        request.chainId,
        request.privateKey,
        request.transaction,
        {
          sellToken: request.sellToken,
          buyToken: request.buyToken,
          sellAmount: request.sellAmount,
          buyAmount: request.buyAmount,
        }
      );

      this.logger.log(`AllowanceHolder swap executed successfully: ${result.transactionHash}`);

      return {
        success: true,
        data: {
          ...result,
          strategy: 'allowance-holder',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to execute AllowanceHolder swap: ${error.message}`, error.stack);
      
      // Transform specific errors into appropriate HTTP exceptions
      if (error.message.includes('Insufficient funds') || error.message.includes('Insufficient balance')) {
        throw new BadRequestException({
          message: 'Insufficient funds for transaction. Please check your wallet balance.',
          error: 'InsufficientFunds',
          details: 'The wallet does not have enough balance to cover the transaction amount and gas fees.'
        });
      } else if (error.message.includes('Gas estimation failed')) {
        throw new BadRequestException({
          message: 'Gas estimation failed. The transaction may fail or gas limit may be too low.',
          error: 'GasEstimationFailed',
          details: 'Unable to estimate gas for the transaction. Please check transaction parameters.'
        });
      } else if (error.message.includes('Transaction nonce issue')) {
        throw new BadRequestException({
          message: 'Transaction nonce issue. Please try again.',
          error: 'NonceIssue',
          details: 'There was an issue with the transaction nonce. Please retry the transaction.'
        });
      } else if (error.message.includes('Transaction replacement issue')) {
        throw new BadRequestException({
          message: 'Transaction replacement issue. Please wait for pending transactions to complete.',
          error: 'TransactionReplacement',
          details: 'There are pending transactions that need to complete first.'
        });
      } else if (error.message.includes('Invalid private key')) {
        throw new BadRequestException({
          message: 'Invalid private key provided.',
          error: 'InvalidPrivateKey',
          details: 'The provided private key is not valid or properly formatted.'
        });
      } else if (error.message.includes('slippage tolerance exceeded')) {
        throw new BadRequestException({
          message: 'Transaction failed due to slippage tolerance exceeded.',
          error: 'SlippageExceeded',
          details: 'The price moved beyond your slippage tolerance. Try increasing slippage or retry.'
        });
      } else if (error.message.includes('deadline exceeded')) {
        throw new BadRequestException({
          message: 'Transaction deadline exceeded.',
          error: 'DeadlineExceeded',
          details: 'The transaction took too long to process and exceeded the deadline.'
        });
      } else if (error.message.includes('network')) {
        throw new ServiceUnavailableException({
          message: 'Network error occurred during transaction.',
          error: 'NetworkError',
          details: 'There was a network connectivity issue. Please try again.'
        });
      } else {
        // For unknown errors, throw internal server error with sanitized message
        throw new InternalServerErrorException({
          message: 'Swap execution failed. Please try again.',
          error: 'SwapExecutionFailed',
          details: 'An unexpected error occurred during swap execution.'
        });
      }
    }
  }

  /**
   * Get permit2 quote with gasless approval data (Advanced Use Only)
   */
  @Post('permit2/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get permit2 quote with gasless approval support',
    description: 'Get swap quote from 0x Protocol v2 with permit2 EIP-712 data for gasless approvals. Returns permit2 data that can be signed and appended to transaction data.'
  })
  @ApiResponse({
    status: 200,
    description: 'Permit2 quote retrieved successfully',
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
            permit2: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                hash: { type: 'string' },
                eip712: {
                  type: 'object',
                  properties: {
                    types: { type: 'object' },
                    domain: { type: 'object' },
                    message: { type: 'object' },
                    primaryType: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        timestamp: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getPermit2Quote(@Body() request: SwapQuoteRequestDto): Promise<SwapQuote> {
    this.logger.log(`Getting permit2 quote for ${request.sellToken} -> ${request.buyToken}`);
    
    try {
      // Force aggregator to 0x for permit2 quotes
      const permit2Request = { ...request, aggregator: AggregatorType.ZEROX };
      
      return await this.quoteService.getQuote(
        permit2Request.chainId,
        permit2Request.sellToken,
        permit2Request.buyToken,
        permit2Request.sellAmount,
        permit2Request.taker,
        permit2Request.recipient,
        permit2Request.slippagePercentage,
        permit2Request.deadline,
        permit2Request.aggregator,
      );
    } catch (error) {
      this.handleQuoteError(error, 'get permit2 quote');
    }
  }

  /**
   * Get permit2 info from quote (for debugging/inspection)
   */
  @Post('permit2/info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Extract permit2 information from quote',
    description: 'Get detailed information about permit2 data in a quote for debugging and inspection purposes.'
  })
  @ApiResponse({
    status: 200,
    description: 'Permit2 info extracted successfully',
    schema: {
      type: 'object',
      properties: {
        hasPermit2: { type: 'boolean' },
        type: { type: 'string' },
        hash: { type: 'string' },
        primaryType: { type: 'string' },
        domain: { type: 'object' },
        messageKeys: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async getPermit2Info(@Body() quoteDto: Permit2InfoRequestDto): Promise<any> {
    this.logger.log('Extracting permit2 info from quote');
    
    try {
      // Convert DTO to SwapQuote interface
      const quote: SwapQuote = {
        sellToken: quoteDto.sellToken,
        buyToken: quoteDto.buyToken,
        sellAmount: quoteDto.sellAmount,
        buyAmount: quoteDto.buyAmount,
        minBuyAmount: quoteDto.minBuyAmount,
        gas: quoteDto.gas,
        gasPrice: quoteDto.gasPrice,
        to: quoteDto.to,
        data: quoteDto.data,
        value: quoteDto.value,
        allowanceTarget: quoteDto.allowanceTarget,
        aggregator: quoteDto.aggregator as AggregatorType,
        priceImpact: quoteDto.priceImpact,
        estimatedGas: quoteDto.estimatedGas,
        permit2: quoteDto.permit2 ? {
          type: quoteDto.permit2.type,
          hash: quoteDto.permit2.hash,
          eip712: {
            types: quoteDto.permit2.eip712.types,
            domain: quoteDto.permit2.eip712.domain,
            message: quoteDto.permit2.eip712.message,
            primaryType: quoteDto.permit2.eip712.primaryType,
          },
        } : undefined,
      };
      
      return this.permit2WorkflowService.getPermit2Info(quote);
    } catch (error) {
      this.logger.error(`Failed to get permit2 info: ${error.message}`, error.stack);
      
      if (error.message.includes('Invalid permit2 data')) {
        throw new BadRequestException({
          message: 'Invalid permit2 data provided.',
          error: 'InvalidPermit2Data',
          details: 'The provided quote does not contain valid permit2 data structure.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to extract permit2 info. Please try again.',
          error: 'Permit2InfoError',
          details: 'An unexpected error occurred while extracting permit2 information.'
        });
      }
    }
  }
}
