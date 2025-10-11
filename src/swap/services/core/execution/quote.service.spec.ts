import { Test, TestingModule } from '@nestjs/testing';
import { QuoteService } from './quote.service';
import { AggregatorManagerService } from './aggregator-manager.service';
import { AggregatorType } from '../models/swap-request.model';

describe('QuoteService', () => {
  let service: QuoteService;
  let aggregatorManager: AggregatorManagerService;

  const mockAggregatorManager = {
    getQuote: jest.fn(),
    getSupportedAggregators: jest.fn(),
    isAggregatorSupported: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteService,
        {
          provide: AggregatorManagerService,
          useValue: mockAggregatorManager,
        },
      ],
    }).compile();

    service = module.get<QuoteService>(QuoteService);
    aggregatorManager = module.get<AggregatorManagerService>(AggregatorManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getQuote', () => {
    it('should get quote from aggregator manager', async () => {
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

      mockAggregatorManager.getQuote.mockResolvedValue(mockQuote);

      const result = await service.getQuote(
        1,
        '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
        '1000000000000000000',
        '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      );

      expect(result).toEqual(mockQuote);
      expect(mockAggregatorManager.getQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 1,
          sellToken: '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
          buyToken: '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
          sellAmount: '1000000000000000000',
          taker: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        }),
        undefined,
      );
    });

    it('should throw error for invalid inputs', async () => {
      await expect(
        service.getQuote(
          1,
          'invalid-address',
          '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
          '1000000000000000000',
          '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        ),
      ).rejects.toThrow('Invalid token address format');
    });

    it('should throw error for same sell and buy token', async () => {
      await expect(
        service.getQuote(
          1,
          '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
          '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
          '1000000000000000000',
          '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        ),
      ).rejects.toThrow('Sell token and buy token cannot be the same');
    });
  });

  describe('getSupportedAggregators', () => {
    it('should return supported aggregators', () => {
      const supportedAggregators = [AggregatorType.ZEROX, AggregatorType.ONEINCH];
      mockAggregatorManager.getSupportedAggregators.mockReturnValue(supportedAggregators);

      const result = service.getSupportedAggregators(1);

      expect(result).toEqual(supportedAggregators);
      expect(mockAggregatorManager.getSupportedAggregators).toHaveBeenCalledWith(1);
    });
  });

  describe('isAggregatorSupported', () => {
    it('should check if aggregator is supported', () => {
      mockAggregatorManager.isAggregatorSupported.mockReturnValue(true);

      const result = service.isAggregatorSupported(1, AggregatorType.ZEROX);

      expect(result).toBe(true);
      expect(mockAggregatorManager.isAggregatorSupported).toHaveBeenCalledWith(1, AggregatorType.ZEROX);
    });
  });
});
