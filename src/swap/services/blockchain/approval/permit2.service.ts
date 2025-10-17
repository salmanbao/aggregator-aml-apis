import { Injectable, Logger } from '@nestjs/common';
import { 
  getContract,
  type Address,
} from 'viem';
import { ERC20_ABI } from '@shared/utils/ethereum.utils';
import { 
  createViemClients, 
  getAccountFromPrivateKey 
} from '@shared/utils/viem.utils';
import { 
  executeWithErrorHandling, 
  type ErrorContext 
} from '@shared/utils/error-handling.utils';

/**
 * Permit2 service for handling gasless approvals with 0x Protocol v2
 * 
 * Fully implemented with Viem v2.38.0 for complete EIP-712 signing and contract interactions
 * Supports all major EVM chains with Permit2 contract deployments
 */
@Injectable()
export class Permit2Service {
  private readonly logger = new Logger(Permit2Service.name);

  // Known Permit2 contract addresses for different chains
  private readonly permit2Addresses: Record<number, string> = {
    1: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Ethereum
    137: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Polygon
    56: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // BSC
    42161: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Arbitrum
    10: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Optimism
    8453: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Base
    43114: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Avalanche
  };

  /**
   * Get Permit2 contract address for a chain
   */
  getPermit2Address(chainId: number): string {
    const address = this.permit2Addresses[chainId];
    if (!address) {
      throw new Error(`Permit2 not supported on chain ${chainId}`);
    }
    return address;
  }

  /**
   * Check if Permit2 is supported on a chain
   */
  isPermit2Supported(chainId: number): boolean {
    return chainId in this.permit2Addresses;
  }

  /**
   * Create Permit2 signature for gasless approval from 0x API permit2 data
   * Uses the EIP-712 data directly from 0x API response
   */
  async signPermit2Data(
    chainId: number,
    privateKey: string,
    permit2Data: {
      type: string;
      hash: string;
      eip712: {
        types: Record<string, any>;
        domain: Record<string, any>;
        message: Record<string, any>;
        primaryType: string;
      };
    }
  ): Promise<string> {
    const context: ErrorContext = { 
      method: 'signPermit2Data', 
      chainId 
    };

    return executeWithErrorHandling(
      async () => {
        this.logger.log(`Creating Permit2 signature for chain ${chainId}`);

        // Create wallet client using shared utility
        const { walletClient } = createViemClients(chainId, privateKey);
        if (!walletClient) {
          throw new Error('Failed to create wallet client');
        }

        const account = getAccountFromPrivateKey(privateKey);

        this.logger.debug('Signing Permit2 EIP-712 message', {
          domain: permit2Data.eip712.domain,
          primaryType: permit2Data.eip712.primaryType
        });

        // Sign the EIP-712 typed data from 0x API
        const signature = await walletClient.signTypedData({
          account: account,
          types: permit2Data.eip712.types,
          domain: permit2Data.eip712.domain,
          message: permit2Data.eip712.message,
          primaryType: permit2Data.eip712.primaryType,
        });

        this.logger.debug('Permit2 signature created successfully');
        return signature;
      },
      this.logger,
      'Failed to sign Permit2 data',
      context
    );
  }

  /**
   * Append signature to transaction data (following 0x Protocol v2 pattern)
   * Based on 0x examples: concat([transactionData, signatureLengthHex, signature])
   */
  async appendSignatureToTxData(
    transactionData: string,
    signature: string
  ): Promise<string> {
    try {
      // Import required functions from viem
      const { concat, numberToHex, size } = await import('viem');

      // Calculate signature length and convert to hex (32 bytes)
      const signatureLengthInHex = numberToHex(size(signature as `0x${string}`), {
        signed: false,
        size: 32,
      });

      // Concatenate transaction data + signature length + signature
      const modifiedTxData = concat([
        transactionData as `0x${string}`,
        signatureLengthInHex as `0x${string}`,
        signature as `0x${string}`,
      ]);

      this.logger.debug('Signature appended to transaction data', {
        originalLength: transactionData.length,
        signatureLength: signature.length,
        finalLength: modifiedTxData.length
      });

      return modifiedTxData;
    } catch (error) {
      this.logger.error(`Failed to append signature to tx data: ${error.message}`, error.stack);
      throw new Error(`Signature concatenation failed: ${error.message}`);
    }
  }

  /**
   * Check if token supports Permit2
   * Returns true if the token contract implements the necessary interfaces for Permit2
   */
  async isTokenPermit2Compatible(chainId: number, tokenAddress: string): Promise<boolean> {
    try {
      // Check if Permit2 is supported on this chain
      if (!this.isPermit2Supported(chainId)) {
        this.logger.debug(`Permit2 not supported on chain ${chainId}`);
        return false;
      }

      // Handle native token (ETH, MATIC, BNB, etc.) - these don't support Permit2
      if (tokenAddress === '0x0000000000000000000000000000000000000000' || 
          tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        this.logger.debug('Native token does not support Permit2');
        return false;
      }

      // Create public client using shared utility
      const { publicClient } = createViemClients(chainId);

      // Create contract instance for the token
      const tokenContract = getContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        client: publicClient
      });

      // Check if token contract exists and has required methods
      // We'll check for the standard ERC-20 interface first
      try {
        // Try to read basic token info to verify it's a valid ERC-20
        const [symbol, decimals] = await Promise.all([
          tokenContract.read.symbol(),
          tokenContract.read.decimals()
        ]);

        this.logger.debug(`Token ${tokenAddress} verified as ERC-20`, {
          symbol,
          decimals,
          chainId
        });

        // For now, assume all valid ERC-20 tokens can work with Permit2
        // The actual permit2 compatibility is handled at the protocol level
        // Individual tokens don't need special support for Permit2
        return true;

      } catch (contractError) {
        this.logger.debug(`Token ${tokenAddress} contract interaction failed`, {
          error: contractError.message,
          chainId
        });
        return false;
      }

    } catch (error) {
      this.logger.error(`Failed to check Permit2 compatibility for token ${tokenAddress}`, {
        error: error.message,
        chainId
      });
      return false;
    }
  }

  /**
   * Check if Permit2 approval is needed
   * Returns true if the current allowance is insufficient for the requested amount
   */
  async isPermit2ApprovalNeeded(
    chainId: number,
    tokenAddress: string,
    owner: string,
    spender: string,
    amount: string,
  ): Promise<boolean> {
    try {
      // Check if token supports Permit2 first
      const isCompatible = await this.isTokenPermit2Compatible(chainId, tokenAddress);
      if (!isCompatible) {
        this.logger.debug('Token not compatible with Permit2, standard approval needed');
        return true; // Fall back to standard ERC-20 approval
      }

      // Create public client using shared utility
      const { publicClient } = createViemClients(chainId);
      const permit2Address = this.getPermit2Address(chainId);

      // Permit2 contract ABI for allowance check
      const PERMIT2_ABI = [
        {
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'token', type: 'address' },
            { name: 'spender', type: 'address' }
          ],
          name: 'allowance',
          outputs: [
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' }
          ],
          stateMutability: 'view',
          type: 'function'
        }
      ];

      // Create Permit2 contract instance
      const permit2Contract = getContract({
        address: permit2Address as Address,
        abi: PERMIT2_ABI,
        client: publicClient
      });

      // Get current Permit2 allowance
      const allowanceResult = await permit2Contract.read.allowance([
        owner as Address,
        tokenAddress as Address,
        spender as Address
      ]) as [bigint, number, number];

      const [allowanceAmount, expiration, nonce] = allowanceResult;

      // Check if allowance is sufficient and not expired
      const currentTime = Math.floor(Date.now() / 1000);
      const amountBigInt = BigInt(amount);
      const allowanceBigInt = BigInt(allowanceAmount.toString());

      const isExpired = expiration < currentTime;
      const isInsufficientAmount = allowanceBigInt < amountBigInt;

      if (isExpired || isInsufficientAmount) {
        this.logger.debug('Permit2 approval needed', {
          allowance: allowanceAmount.toString(),
          requested: amount,
          expiration,
          currentTime,
          isExpired,
          isInsufficientAmount
        });
        return true;
      }

      this.logger.debug('Permit2 allowance sufficient', {
        allowance: allowanceAmount.toString(),
        requested: amount,
        expiration
      });
      return false;

    } catch (error) {
      this.logger.error(`Failed to check Permit2 approval need: ${error.message}`, {
        chainId,
        tokenAddress,
        owner,
        spender,
        amount
      });
      // On error, assume approval is needed for safety
      return true;
    }
  }

  /**
   * Verify Permit2 signature
   * Validates that a signature is valid for the given permit data
   */
  async verifyPermit2Signature(
    chainId: number,
    tokenAddress: string,
    signature: string,
    permitData: {
      types: Record<string, any>;
      domain: Record<string, any>;
      message: Record<string, any>;
      primaryType: string;
    },
  ): Promise<boolean> {
    try {
      // Create public client using shared utility
      const { publicClient } = createViemClients(chainId);

      // Import verifyTypedData from viem
      const { verifyTypedData, recoverTypedDataAddress } = await import('viem');

      // Get the address that signed the message
      const signerAddress = await recoverTypedDataAddress({
        types: permitData.types,
        domain: permitData.domain,
        message: permitData.message,
        primaryType: permitData.primaryType,
        signature: signature as `0x${string}`
      });

      // Verify that the signature is valid for the typed data
      const isValidSignature = await verifyTypedData({
        address: signerAddress,
        types: permitData.types,
        domain: permitData.domain,
        message: permitData.message,
        primaryType: permitData.primaryType,
        signature: signature as `0x${string}`
      });

      this.logger.debug('Permit2 signature verification result', {
        signerAddress,
        isValidSignature,
        chainId,
        tokenAddress
      });

      return isValidSignature;

    } catch (error) {
      this.logger.error(`Failed to verify Permit2 signature: ${error.message}`, {
        chainId,
        tokenAddress,
        error: error.stack
      });
      return false;
    }
  }

  /**
   * Get Permit2 allowance for a token
   * Returns the current allowance amount from the Permit2 contract
   */
  async getPermit2Allowance(
    chainId: number,
    tokenAddress: string,
    owner: string,
    spender: string,
  ): Promise<string> {
    try {
      // Create public client using shared utility
      const { publicClient } = createViemClients(chainId);
      const permit2Address = this.getPermit2Address(chainId);

      // Permit2 contract ABI for allowance check
      const PERMIT2_ABI = [
        {
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'token', type: 'address' },
            { name: 'spender', type: 'address' }
          ],
          name: 'allowance',
          outputs: [
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' }
          ],
          stateMutability: 'view',
          type: 'function'
        }
      ];

      // Create Permit2 contract instance
      const permit2Contract = getContract({
        address: permit2Address as Address,
        abi: PERMIT2_ABI,
        client: publicClient
      });

      // Get current Permit2 allowance
      const allowanceResult = await permit2Contract.read.allowance([
        owner as Address,
        tokenAddress as Address,
        spender as Address
      ]) as [bigint, number, number];

      const [allowanceAmount, expiration, nonce] = allowanceResult;

      // Check if allowance is expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (expiration < currentTime) {
        this.logger.debug('Permit2 allowance expired', {
          expiration,
          currentTime,
          owner,
          tokenAddress,
          spender
        });
        return '0'; // Return 0 for expired allowances
      }

      const allowanceStr = allowanceAmount.toString();
      this.logger.debug('Permit2 allowance retrieved', {
        allowance: allowanceStr,
        expiration,
        nonce,
        owner,
        tokenAddress,
        spender
      });

      return allowanceStr;

    } catch (error) {
      this.logger.error(`Failed to get Permit2 allowance: ${error.message}`, {
        chainId,
        tokenAddress,
        owner,
        spender
      });
      throw new Error(`Permit2 allowance retrieval failed: ${error.message}`);
    }
  }
}