import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { DexQuote, DexType, OrderRequest } from '../types/order.types';
import { getTokenMint, parseTokenAmount } from '../utils/token.utils';
import { calculateConstantProductQuote } from '../utils/quote.util';

type ApiV2PoolInfoItem = any;

export class RaydiumService {
  constructor() {
    // SolanaConfig can be accessed via SolanaConfig.getInstance() when needed
  }

  public async getQuote(orderRequest: OrderRequest): Promise<DexQuote> {
    const startTime = Date.now();
    
    try {
      const tokenInMint = getTokenMint(orderRequest.tokenIn);
      const tokenOutMint = getTokenMint(orderRequest.tokenOut);
      const amountIn = parseTokenAmount(orderRequest.amountIn);

      const poolInfo = await this.findPool(tokenInMint, tokenOutMint);
      
      if (!poolInfo) {
        throw new Error(`No Raydium pool found for ${orderRequest.tokenIn}/${orderRequest.tokenOut}`);
      }

      const quote = await this.calculateQuote(poolInfo, tokenInMint, tokenOutMint, amountIn);
      
      const latency = Date.now() - startTime;
      
      return {
        dex: DexType.RAYDIUM,
        quotePrice: quote.price.toString(),
        effectivePrice: quote.effectivePrice.toString(),
        fee: quote.fee.toString(),
        amountOut: quote.amountOut,
        latency,
        poolAddress: poolInfo.id,
        poolInfo: poolInfo as any,
      };
    } catch (error: any) {
      console.error('[Raydium Service] Error getting quote:', error);
      throw new Error(`Raydium quote failed: ${error.message}`);
    }
  }

  public async buildSwapTransaction(
    _orderRequest: OrderRequest,
    quote: DexQuote
  ): Promise<VersionedTransaction> {
    try {
      const poolInfo = quote.poolInfo as ApiV2PoolInfoItem;
      if (!poolInfo) {
        throw new Error('Pool info not available in quote');
      }

      throw new Error('Raydium swap transaction building requires actual SDK implementation. Please refer to Raydium SDK documentation.');
    } catch (error: any) {
      console.error('[Raydium Service] Error building transaction:', error);
      console.error('[Raydium Service] Error details:', error.stack);
      throw new Error(`Failed to build Raydium transaction: ${error.message}`);
    }
  }

  private async findPool(tokenInMint: PublicKey, tokenOutMint: PublicKey): Promise<ApiV2PoolInfoItem | null> {
    try {
      const response = await fetch('https://api.raydium.io/v2/sdk/liquidity/mainnet.json');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch pools: ${response.statusText}`);
      }
      
      const pools: ApiV2PoolInfoItem[] = await response.json() as ApiV2PoolInfoItem[];

      const pool = pools.find((p) => {
        const baseMint = p.baseMint;
        const quoteMint = p.quoteMint;
        return (
          (baseMint === tokenInMint.toString() && quoteMint === tokenOutMint.toString()) ||
          (baseMint === tokenOutMint.toString() && quoteMint === tokenInMint.toString())
        );
      });

      return pool || null;
    } catch (error: any) {
      return null;
    }
  }

  private async calculateQuote(
    poolInfo: ApiV2PoolInfoItem,
    tokenInMint: PublicKey,
    _tokenOutMint: PublicKey,
    amountIn: bigint
  ): Promise<{
    price: number;
    effectivePrice: number;
    fee: number;
    amountOut: string;
  }> {
    try {
      const isBaseIn = poolInfo.baseMint === tokenInMint.toString();
      const baseReserve = parseFloat(poolInfo.baseReserve || '0');
      const quoteReserve = parseFloat(poolInfo.quoteReserve || '0');

      return calculateConstantProductQuote({
        reserveA: baseReserve,
        reserveB: quoteReserve,
        amountIn,
        isReserveAIn: isBaseIn,
        feeRate: 0.0025,
      });
    } catch (error: any) {
      console.error('[Raydium Service] Error calculating quote:', error);
      throw new Error(`Quote calculation failed: ${error.message}`);
    }
  }
}
