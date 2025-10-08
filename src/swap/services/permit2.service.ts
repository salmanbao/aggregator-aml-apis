import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { getChainConfig } from '../../shared/utils/chain.utils';
import { createProvider, createWallet } from '../../shared/utils/ethereum.utils';

/**
 * Permit2 service for handling gasless approvals with 0x Protocol v2
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
   * Create Permit2 signature for gasless approval
   */
  async createPermit2Signature(
    chainId: number,
    privateKey: string,
    tokenAddress: string,
    spender: string,
    amount: string,
    deadline: number,
  ): Promise<{
    signature: string;
    permitData: any;
  }> {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = createProvider(chainConfig.rpcUrl);
      const wallet = createWallet(privateKey, provider);

      // Get token info
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function name() view returns (string)',
          'function version() view returns (string)',
          'function nonces(address owner) view returns (uint256)',
        ],
        provider,
      );

      const [name, version, nonce] = await Promise.all([
        tokenContract.name(),
        tokenContract.version(),
        tokenContract.nonces(wallet.address),
      ]);

      // Create Permit2 domain
      const domain = {
        name: 'Permit2',
        chainId: chainId,
        verifyingContract: this.getPermit2Address(chainId),
      };

      // Create Permit2 types
      const types = {
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
      };

      // Create permit data
      const permitData = {
        details: {
          token: tokenAddress,
          amount: amount,
          expiration: deadline,
          nonce: nonce.toString(),
        },
        spender: spender,
        sigDeadline: deadline,
      };

      // Sign the permit
      const signature = await wallet.signTypedData(domain, types, permitData);

      this.logger.debug(`Created Permit2 signature for token ${tokenAddress}`);

      return {
        signature,
        permitData,
      };
    } catch (error) {
      this.logger.error(`Failed to create Permit2 signature: ${error.message}`, error.stack);
      throw new Error(`Failed to create Permit2 signature: ${error.message}`);
    }
  }

  /**
   * Validate Permit2 signature
   */
  async validatePermit2Signature(
    chainId: number,
    tokenAddress: string,
    owner: string,
    spender: string,
    amount: string,
    deadline: number,
    signature: string,
  ): Promise<boolean> {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = createProvider(chainConfig.rpcUrl);

      // Get token info
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function name() view returns (string)',
          'function version() view returns (string)',
          'function nonces(address owner) view returns (uint256)',
        ],
        provider,
      );

      const [name, version, nonce] = await Promise.all([
        tokenContract.name(),
        tokenContract.version(),
        tokenContract.nonces(owner),
      ]);

      // Create Permit2 domain
      const domain = {
        name: 'Permit2',
        chainId: chainId,
        verifyingContract: this.getPermit2Address(chainId),
      };

      // Create Permit2 types
      const types = {
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
      };

      // Create permit data
      const permitData = {
        details: {
          token: tokenAddress,
          amount: amount,
          expiration: deadline,
          nonce: nonce.toString(),
        },
        spender: spender,
        sigDeadline: deadline,
      };

      // Verify signature
      const recoveredAddress = ethers.verifyTypedData(domain, types, permitData, signature);
      const isValid = recoveredAddress.toLowerCase() === owner.toLowerCase();

      this.logger.debug(`Permit2 signature validation: ${isValid ? 'valid' : 'invalid'}`);

      return isValid;
    } catch (error) {
      this.logger.error(`Failed to validate Permit2 signature: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Check if token supports Permit2
   */
  async isTokenPermit2Compatible(chainId: number, tokenAddress: string): Promise<boolean> {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = createProvider(chainConfig.rpcUrl);

      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function name() view returns (string)',
          'function version() view returns (string)',
          'function nonces(address owner) view returns (uint256)',
        ],
        provider,
      );

      // Check if token has required functions for Permit2
      await Promise.all([
        tokenContract.name(),
        tokenContract.version(),
        tokenContract.nonces('0x0000000000000000000000000000000000000000'),
      ]);

      return true;
    } catch (error) {
      this.logger.debug(`Token ${tokenAddress} is not Permit2 compatible: ${error.message}`);
      return false;
    }
  }

  /**
   * Get Permit2 allowance for a token
   */
  async getPermit2Allowance(
    chainId: number,
    tokenAddress: string,
    owner: string,
    spender: string,
  ): Promise<string> {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = createProvider(chainConfig.rpcUrl);

      const permit2Contract = new ethers.Contract(
        this.getPermit2Address(chainId),
        [
          'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
        ],
        provider,
      );

      const [amount, expiration, nonce] = await permit2Contract.allowance(owner, tokenAddress, spender);

      // Check if allowance is still valid
      const currentTime = Math.floor(Date.now() / 1000);
      if (expiration > 0 && expiration < currentTime) {
        return '0'; // Expired
      }

      return amount.toString();
    } catch (error) {
      this.logger.error(`Failed to get Permit2 allowance: ${error.message}`, error.stack);
      throw new Error(`Failed to get Permit2 allowance: ${error.message}`);
    }
  }

  /**
   * Check if Permit2 approval is needed
   */
  async isPermit2ApprovalNeeded(
    chainId: number,
    tokenAddress: string,
    owner: string,
    spender: string,
    amount: string,
  ): Promise<boolean> {
    try {
      const currentAllowance = await this.getPermit2Allowance(chainId, tokenAddress, owner, spender);
      const requiredAmount = BigInt(amount);
      const currentAllowanceBigInt = BigInt(currentAllowance);

      return currentAllowanceBigInt < requiredAmount;
    } catch (error) {
      this.logger.error(`Failed to check Permit2 approval: ${error.message}`, error.stack);
      return true; // Assume approval is needed if we can't check
    }
  }
}
