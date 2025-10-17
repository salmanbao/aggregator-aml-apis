import { Injectable } from '@nestjs/common';

/**
 * SwapCacheService
 * Caches supported chain/token pairs from successful quotes for fast lookup and reuse.
 */
@Injectable()
export class SwapCacheService {
  private supportedChainsTokens = new Map<number, { buyTokens: Set<string>, sellTokens: Set<string> }>();

  addSupportedQuote(chainId: number, buyToken: string, sellToken: string) {
    if (!this.supportedChainsTokens.has(chainId)) {
      this.supportedChainsTokens.set(chainId, { buyTokens: new Set(), sellTokens: new Set() });
    }
    const entry = this.supportedChainsTokens.get(chainId)!;
    entry.buyTokens.add(buyToken.toLowerCase());
    entry.sellTokens.add(sellToken.toLowerCase());
  }

  isChainSupported(chainId: number, tokenAddress: string): boolean {
    const entry = this.supportedChainsTokens.get(chainId);
    if (!entry) return false;
    const addr = tokenAddress.toLowerCase();
    return entry.buyTokens.has(addr) || entry.sellTokens.has(addr);
  }

  clearCache() {
    this.supportedChainsTokens.clear();
  }

  getCacheSnapshot() {
    // For debugging/testing
    return Array.from(this.supportedChainsTokens.entries()).map(([chainId, tokens]) => ({
      chainId,
      buyTokens: Array.from(tokens.buyTokens),
      sellTokens: Array.from(tokens.sellTokens),
    }));
  }
}
