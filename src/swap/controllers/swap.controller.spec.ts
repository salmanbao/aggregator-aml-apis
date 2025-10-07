import { Test, TestingModule } from '@nestjs/testing';
import { SwapController } from './swap.controller';
import { QuoteService } from '../services/quote.service';
import { SwapExecutionService } from '../services/swap-execution.service';
import { ApprovalService } from '../services/approval.service';
import { WalletService } from '../services/wallet.service';
import { AggregatorType } from '../models/swap-request.model';

describe('SwapController', () => {
  let controller: SwapController;
  let quoteService: QuoteService;
  let swapExecutionService: SwapExecutionService;
  let approvalService: ApprovalService;
  let walletService: WalletService;

  const mockQuoteService = {
    getQuote: jest.fn(),
    getMultipleQuotes: jest.fn(),
    getBestQuote: jest.fn(),
    compareQuotes: jest.fn(),
    getSupportedAggregators: jest.fn(),
  };

  const mockSwapExecutionService = {
    executeSwap: jest.fn(),
  };

  const mockApprovalService = {
    getApprovalStatus: jest.fn(),
    executeApproval: jest.fn(),
  };

  const mockWalletService = {
    getBalance: jest.fn(),
    getMultipleBalances: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SwapController],
      providers: [
        {
          provide: QuoteService,
          useValue: mockQuoteService,
        },
        {
          provide: SwapExecutionService,
          useValue: mockSwapExecutionService,
        },
        {
          provide: ApprovalService,
          useValue: mockApprovalService,
        },
        {
          provide: WalletService,
          useValue: mockWalletService,
        },
      ],
    }).compile();

    controller = module.get<SwapController>(SwapController);
    quoteService = module.get<QuoteService>(QuoteService);
    swapExecutionService = module.get<SwapExecutionService>(SwapExecutionService);
    approvalService = module.get<ApprovalService>(ApprovalService);
    walletService = module.get<WalletService>(WalletService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getQuote', () => {
    it('should get quote', async () => {
      const mockQuote = {
        sellToken: '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        buyToken: '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        sellAmount: '1000000000000000000',
        buyAmount: '2000000000000000000',
        minBuyAmount: '1900000000000000000',
        gas: '200000',
        gasPrice: '20000000000',
        to: '0xC0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        data: '0x1234567890abcdef',
        value: '0',
        allowanceTarget: '0xD0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        aggregator: AggregatorType.ZEROX,
        priceImpact: '0.1',
        estimatedGas: '200000',
      };

      const request = {
        chainId: 1,
        sellToken: '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        buyToken: '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        sellAmount: '1000000000000000000',
        taker: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      };

      mockQuoteService.getQuote.mockResolvedValue(mockQuote);

      const result = await controller.getQuote(request);

      expect(result).toEqual(mockQuote);
      expect(mockQuoteService.getQuote).toHaveBeenCalledWith(
        1,
        '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        '1000000000000000000',
        '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('executeSwap', () => {
    it('should execute swap', async () => {
      const mockResult = {
        transactionHash: '0x1234567890abcdef',
        sellToken: '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        buyToken: '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        sellAmount: '1000000000000000000',
        buyAmount: '2000000000000000000',
        gasUsed: '200000',
        gasPrice: '20000000000',
        aggregator: AggregatorType.ZEROX,
        timestamp: Date.now(),
      };

      const request = {
        chainId: 1,
        sellToken: '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        buyToken: '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        sellAmount: '1000000000000000000',
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      mockSwapExecutionService.executeSwap.mockResolvedValue(mockResult);

      const result = await controller.executeSwap(request);

      expect(result).toEqual(mockResult);
      expect(mockSwapExecutionService.executeSwap).toHaveBeenCalledWith(
        1,
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        '1000000000000000000',
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();

      expect(result).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
      });
    });
  });
});
