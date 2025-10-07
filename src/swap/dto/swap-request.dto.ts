import { IsString, IsNumber, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AggregatorType } from '../models/swap-request.model';

/**
 * DTO for swap quote request
 */
export class SwapQuoteRequestDto {
  @ApiProperty({
    description: 'Chain ID for the swap',
    example: 1,
  })
  @IsNumber()
  @Type(() => Number)
  chainId: number;

  @ApiProperty({
    description: 'Token address to sell (use 0x0000000000000000000000000000000000000000 for native token)',
    example: '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
  })
  @IsString()
  sellToken: string;

  @ApiProperty({
    description: 'Token address to buy (use 0x0000000000000000000000000000000000000000 for native token)',
    example: '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
  })
  @IsString()
  buyToken: string;

  @ApiProperty({
    description: 'Amount to sell in wei',
    example: '1000000000000000000',
  })
  @IsString()
  sellAmount: string;

  @ApiProperty({
    description: 'Wallet address that will execute the swap',
    example: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
  })
  @IsString()
  taker: string;

  @ApiPropertyOptional({
    description: 'Recipient address (defaults to taker if not provided)',
    example: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
  })
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({
    description: 'Maximum slippage percentage (0-50)',
    example: 0.5,
    minimum: 0,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  slippagePercentage?: number;

  @ApiPropertyOptional({
    description: 'Transaction deadline timestamp in seconds',
    example: 1704067200,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  deadline?: number;

  @ApiPropertyOptional({
    description: 'Preferred aggregator to use',
    enum: AggregatorType,
    example: AggregatorType.ZEROX,
  })
  @IsOptional()
  @IsEnum(AggregatorType)
  aggregator?: AggregatorType;
}

/**
 * DTO for swap execution request
 */
export class SwapExecutionRequestDto {
  @ApiProperty({
    description: 'Chain ID for the swap',
    example: 1,
  })
  @IsNumber()
  @Type(() => Number)
  chainId: number;

  @ApiProperty({
    description: 'Token address to sell',
    example: '0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
  })
  @IsString()
  sellToken: string;

  @ApiProperty({
    description: 'Token address to buy',
    example: '0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b',
  })
  @IsString()
  buyToken: string;

  @ApiProperty({
    description: 'Amount to sell in wei',
    example: '1000000000000000000',
  })
  @IsString()
  sellAmount: string;

  @ApiProperty({
    description: 'Wallet private key for signing transactions',
    example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  })
  @IsString()
  privateKey: string;

  @ApiPropertyOptional({
    description: 'Recipient address (defaults to wallet address if not provided)',
    example: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
  })
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({
    description: 'Maximum slippage percentage (0-50)',
    example: 0.5,
    minimum: 0,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  slippagePercentage?: number;

  @ApiPropertyOptional({
    description: 'Transaction deadline timestamp in seconds',
    example: 1704067200,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  deadline?: number;

  @ApiPropertyOptional({
    description: 'Preferred aggregator to use',
    enum: AggregatorType,
    example: AggregatorType.ZEROX,
  })
  @IsOptional()
  @IsEnum(AggregatorType)
  aggregator?: AggregatorType;
}
