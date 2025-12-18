import { DexQuote, DexType, OrderRequest } from '../types/order.types';

export class DexRouterService {
  private readonly RAYDIUM_FEE = 0.0025; // 0.25%
  private readonly METEORA_FEE = 0.003; // 0.3%
  private readonly BASE_LATENCY = 200; // ms
  private readonly PRICE_VARIANCE_MIN = 0.02; // 2%
  private readonly PRICE_VARIANCE_MAX = 0.05; // 5%

  public async findBestRoute(orderRequest: OrderRequest): Promise<DexQuote> {
    console.log(`[DEX Router] Finding best route for ${orderRequest.tokenIn} -> ${orderRequest.tokenOut}`);
    
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      this.queryRaydium(orderRequest),
      this.queryMeteora(orderRequest),
    ]);

    const quotes = [raydiumQuote, meteoraQuote];
    const bestQuote = quotes.reduce((best, current) => {
      const bestEffectivePrice = parseFloat(best.effectivePrice);
      const currentEffectivePrice = parseFloat(current.effectivePrice);
      return currentEffectivePrice > bestEffectivePrice ? current : best;
    });

    console.log(`[DEX Router] Selected ${bestQuote.dex} with effective price: ${bestQuote.effectivePrice}`);
    console.log(`[DEX Router] Quotes: Raydium=${raydiumQuote.effectivePrice}, Meteora=${meteoraQuote.effectivePrice}`);

    return bestQuote;
  }

  /**
   * Mock Raydium quote with realistic latency and price variance
   */
  private async queryRaydium(orderRequest: OrderRequest): Promise<DexQuote> {
    await this.simulateLatency();

    const basePrice = this.calculateBasePrice(orderRequest);
    const variance = this.getRandomVariance();
    const quotePrice = basePrice * (1 + variance);
    const fee = quotePrice * this.RAYDIUM_FEE;
    const effectivePrice = quotePrice - fee;
    const amountOut = (parseFloat(orderRequest.amountIn) * effectivePrice).toString();

    return {
      dex: DexType.RAYDIUM,
      quotePrice: quotePrice.toFixed(8),
      effectivePrice: effectivePrice.toFixed(8),
      fee: fee.toFixed(8),
      amountOut,
      latency: this.BASE_LATENCY + Math.random() * 50,
    };
  }

  /**
   * Mock Meteora quote with realistic latency and price variance
   */
  private async queryMeteora(orderRequest: OrderRequest): Promise<DexQuote> {
    await this.simulateLatency();

    const basePrice = this.calculateBasePrice(orderRequest);
    const variance = this.getRandomVariance();
    const quotePrice = basePrice * (1 + variance);
    const fee = quotePrice * this.METEORA_FEE;
    const effectivePrice = quotePrice - fee;
    const amountOut = (parseFloat(orderRequest.amountIn) * effectivePrice).toString();

    return {
      dex: DexType.METEORA,
      quotePrice: quotePrice.toFixed(8),
      effectivePrice: effectivePrice.toFixed(8),
      fee: fee.toFixed(8),
      amountOut,
      latency: this.BASE_LATENCY + Math.random() * 50,
    };
  }

  /**
   * Calculate a base price for the token pair (mock implementation)
   */
  private calculateBasePrice(orderRequest: OrderRequest): number {
    // Mock: Use token hashes to generate a consistent base price
    const tokenInHash = this.simpleHash(orderRequest.tokenIn);
    const tokenOutHash = this.simpleHash(orderRequest.tokenOut);
    const priceSeed = (tokenInHash + tokenOutHash) % 1000;
    return 0.5 + (priceSeed / 1000) * 2; // Price between 0.5 and 2.5
  }

  /**
   * Get random variance between MIN and MAX
   */
  private getRandomVariance(): number {
    return (
      this.PRICE_VARIANCE_MIN +
      Math.random() * (this.PRICE_VARIANCE_MAX - this.PRICE_VARIANCE_MIN)
    );
  }

  /**
   * Simulate network latency
   */
  private async simulateLatency(): Promise<void> {
    const latency = this.BASE_LATENCY + Math.random() * 50;
    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  /**
   * Simple hash function for consistent price calculation
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

