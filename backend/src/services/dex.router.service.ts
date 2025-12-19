import { DexQuote, DexType, OrderRequest } from '../types/order.types';
import { RaydiumService } from './raydium.service';
import { MeteoraService } from './meteora.service';

export class DexRouterService {
  private raydiumService: RaydiumService;
  private meteoraService: MeteoraService;

  constructor() {
    this.raydiumService = new RaydiumService();
    this.meteoraService = new MeteoraService();
  }

  public async findBestRoute(orderRequest: OrderRequest): Promise<DexQuote> {
    const [raydiumQuote, meteoraQuote] = await Promise.allSettled([
      this.queryRaydium(orderRequest),
      this.queryMeteora(orderRequest),
    ]);

    const quotes: DexQuote[] = [];

    if (raydiumQuote.status === 'fulfilled') {
      quotes.push(raydiumQuote.value);
    }

    if (meteoraQuote.status === 'fulfilled') {
      quotes.push(meteoraQuote.value);
    }

    if (quotes.length === 0) {
      throw new Error('No DEX quotes available. Both Raydium and Meteora failed.');
    }

    const bestQuote = quotes.reduce((best, current) => {
      const bestEffectivePrice = parseFloat(best.effectivePrice);
      const currentEffectivePrice = parseFloat(current.effectivePrice);
      return currentEffectivePrice > bestEffectivePrice ? current : best;
    });

    return bestQuote;
  }

  private async queryRaydium(orderRequest: OrderRequest): Promise<DexQuote> {
    return await this.raydiumService.getQuote(orderRequest);
  }

  private async queryMeteora(orderRequest: OrderRequest): Promise<DexQuote> {
    return await this.meteoraService.getQuote(orderRequest);
  }

  public async buildSwapTransaction(orderRequest: OrderRequest, quote: DexQuote): Promise<any> {
    if (quote.dex === DexType.RAYDIUM) {
      return await this.raydiumService.buildSwapTransaction(orderRequest, quote);
    } else if (quote.dex === DexType.METEORA) {
      return await this.meteoraService.buildSwapTransaction(orderRequest, quote);
    } else {
      throw new Error(`Unknown DEX type: ${quote.dex}`);
    }
  }
}

