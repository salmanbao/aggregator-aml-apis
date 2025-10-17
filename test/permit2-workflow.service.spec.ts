import { Test, TestingModule } from '@nestjs/testing';
import { Permit2WorkflowService } from '../src/swap/services/permit2-workflow.service';
import { Permit2Service } from '../src/swap/services/permit2.service';
import { SwapQuote, AggregatorType } from '../src/swap/models/swap-request.model';

describe('Permit2WorkflowService', () => {
  let service: Permit2WorkflowService;
  let permit2Service: Permit2Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Permit2WorkflowService,
        {
          provide: Permit2Service,
          useValue: {
            signPermit2Data: jest.fn(),
            appendSignatureToTxData: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<Permit2WorkflowService>(Permit2WorkflowService);
    permit2Service = module.get<Permit2Service>(Permit2Service);
  });

  it('should detect permit2 data in quote', () => {
    const quoteWithPermit2: SwapQuote = {
      sellToken: '0x4200000000000000000000000000000000000006',
      buyToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      sellAmount: '100000000000000',
      buyAmount: '268596',
      minBuyAmount: '268596',
      gas: '289084',
      gasPrice: '5388574',
      to: '0x6a57a0579e91a5b7ce9c2d08b93e1a9b995f974f',
      data: '0x123456',
      value: '0',
      aggregator: AggregatorType.ZEROX,
      permit2: {
        type: 'Permit2',
        hash: '0xa0a1b4676826d055e3cfca8ce0ce4228fe269b786fdc928a9345e80c44d09202',
        eip712: {
          types: {
            TokenPermissions: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' }
            ],
            PermitTransferFrom: [
              { name: 'permitted', type: 'TokenPermissions' },
              { name: 'spender', type: 'address' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' }
            ]
          },
          domain: {
            name: 'Permit2',
            chainId: 8453,
            verifyingContract: '0x000000000022d473030f116ddee9f6b43ac78ba3'
          },
          message: {
            permitted: {
              token: '0x4200000000000000000000000000000000000006',
              amount: '100000000000000'
            },
            spender: '0x6a57a0579e91a5b7ce9c2d08b93e1a9b995f974f',
            nonce: '2241959297937691820908574931991581',
            deadline: '1721085355'
          },
          primaryType: 'PermitTransferFrom'
        }
      }
    };

    const quoteWithoutPermit2: SwapQuote = {
      ...quoteWithPermit2,
      permit2: undefined
    };

    expect(service.hasPermit2Data(quoteWithPermit2)).toBe(true);
    expect(service.hasPermit2Data(quoteWithoutPermit2)).toBe(false);
  });

  it('should extract permit2 info correctly', () => {
    const quote: SwapQuote = {
      sellToken: '0x4200000000000000000000000000000000000006',
      buyToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      sellAmount: '100000000000000',
      buyAmount: '268596',
      minBuyAmount: '268596',
      gas: '289084',
      gasPrice: '5388574',
      to: '0x6a57a0579e91a5b7ce9c2d08b93e1a9b995f974f',
      data: '0x123456',
      value: '0',
      aggregator: AggregatorType.ZEROX,
      permit2: {
        type: 'Permit2',
        hash: '0xa0a1b4676826d055e3cfca8ce0ce4228fe269b786fdc928a9345e80c44d09202',
        eip712: {
          types: {},
          domain: { name: 'Permit2', chainId: 8453 },
          message: { token: '0x123', amount: '1000' },
          primaryType: 'PermitTransferFrom'
        }
      }
    };

    const info = service.getPermit2Info(quote);

    expect(info.hasPermit2).toBe(true);
    expect(info.type).toBe('Permit2');
    expect(info.hash).toBe('0xa0a1b4676826d055e3cfca8ce0ce4228fe269b786fdc928a9345e80c44d09202');
    expect(info.primaryType).toBe('PermitTransferFrom');
    expect(info.messageKeys).toEqual(['token', 'amount']);
  });

  it('should process permit2 quote successfully', async () => {
    const quote: SwapQuote = {
      sellToken: '0x4200000000000000000000000000000000000006',
      buyToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      sellAmount: '100000000000000',
      buyAmount: '268596',
      minBuyAmount: '268596',
      gas: '289084',
      gasPrice: '5388574',
      to: '0x6a57a0579e91a5b7ce9c2d08b93e1a9b995f974f',
      data: '0x123456',
      value: '0',
      aggregator: AggregatorType.ZEROX,
      permit2: {
        type: 'Permit2',
        hash: '0xa0a1b4676826d055e3cfca8ce0ce4228fe269b786fdc928a9345e80c44d09202',
        eip712: {
          types: {},
          domain: {},
          message: {},
          primaryType: 'PermitTransferFrom'
        }
      }
    };

    const mockSignature = '0xabcdef123456789';
    const mockModifiedTxData = '0x123456789abcdef';

    jest.spyOn(permit2Service, 'signPermit2Data').mockResolvedValue(mockSignature);
    jest.spyOn(permit2Service, 'appendSignatureToTxData').mockResolvedValue(mockModifiedTxData);

    const result = await service.processPermit2Quote(quote, 'mock-private-key', 8453);

    expect(result.originalTxData).toBe('0x123456');
    expect(result.signature).toBe(mockSignature);
    expect(result.modifiedTxData).toBe(mockModifiedTxData);
    expect(result.permit2Data).toBe(quote.permit2);
  });

  it('should throw error when processing quote without permit2 data', async () => {
    const quote: SwapQuote = {
      sellToken: '0x4200000000000000000000000000000000000006',
      buyToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      sellAmount: '100000000000000',
      buyAmount: '268596',
      minBuyAmount: '268596',
      gas: '289084',
      gasPrice: '5388574',
      to: '0x6a57a0579e91a5b7ce9c2d08b93e1a9b995f974f',
      data: '0x123456',
      value: '0',
      aggregator: AggregatorType.ZEROX,
      permit2: undefined
    };

    await expect(
      service.processPermit2Quote(quote, 'mock-private-key', 8453)
    ).rejects.toThrow('Quote does not contain permit2 data');
  });
});