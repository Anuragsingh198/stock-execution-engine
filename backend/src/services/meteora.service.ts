import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { DexQuote, DexType, OrderRequest } from '../types/order.types';
import { SolanaConfig } from '../config/solana.config';
import { getTokenMint, parseTokenAmount } from '../utils/token.utils';
import { calculateConstantProductQuote } from '../utils/quote.util';

export class MeteoraService {
  private connection: Connection;
  private solanaConfig: SolanaConfig;

  constructor() {
    this.solanaConfig = SolanaConfig.getInstance();
    this.connection = this.solanaConfig.getConnection();
  }

  public async getQuote(orderRequest: OrderRequest): Promise<DexQuote> {
    const startTime = Date.now();
    
    try {
      const tokenInMint = getTokenMint(orderRequest.tokenIn);
      const tokenOutMint = getTokenMint(orderRequest.tokenOut);
      const amountIn = parseTokenAmount(orderRequest.amountIn);

      const poolInfo = await this.findPool(tokenInMint, tokenOutMint);
      
      if (!poolInfo) {
        throw new Error(`No Meteora pool found for ${orderRequest.tokenIn}/${orderRequest.tokenOut}`);
      }

      const quote = await this.calculateQuote(poolInfo, tokenInMint, tokenOutMint, amountIn);
      
      const latency = Date.now() - startTime;
      
      return {
        dex: DexType.METEORA,
        quotePrice: quote.price.toString(),
        effectivePrice: quote.effectivePrice.toString(),
        fee: quote.fee.toString(),
        amountOut: quote.amountOut,
        latency,
        poolAddress: poolInfo.address,
        poolInfo: poolInfo,
      };
    } catch (error: any) {
      console.error('[Meteora Service] Error getting quote:', error);
      throw new Error(`Meteora quote failed: ${error.message}`);
    }
  }

  public async buildSwapTransaction(
    orderRequest: OrderRequest,
    quote: DexQuote
  ): Promise<VersionedTransaction> {
    try {
      const tokenInMint = getTokenMint(orderRequest.tokenIn);
      const tokenOutMint = getTokenMint(orderRequest.tokenOut);
      const amountIn = parseTokenAmount(orderRequest.amountIn);
      const wallet = this.solanaConfig.getWallet();
      const walletPublicKey = wallet.publicKey;

      const poolInfo = quote.poolInfo as any;
      if (!poolInfo) {
        throw new Error('Pool info not available in quote');
      }

      const swapInstruction = await this.buildSwapInstruction(
        poolInfo,
        walletPublicKey,
        tokenInMint,
        tokenOutMint,
        amountIn,
        parseTokenAmount(quote.amountOut)
      );

      const transaction = new Transaction().add(swapInstruction);
      
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = walletPublicKey;

      const versionedTx = new VersionedTransaction(transaction.compileMessage());
      
      return versionedTx;
    } catch (error: any) {
      console.error('[Meteora Service] Error building transaction:', error);
      throw new Error(`Failed to build Meteora transaction: ${error.message}`);
    }
  }

  private async findPool(tokenInMint: PublicKey, tokenOutMint: PublicKey): Promise<any | null> {
    try {
      const response = await fetch('https://dlmm-api.meteora.ag/pair/all');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch pools: ${response.statusText}`);
      }
      
      const pools: any[] = await response.json() as any[];

      const pool = pools.find((p) => {
        const mintA = p.mint_x || p.tokenA?.mint;
        const mintB = p.mint_y || p.tokenB?.mint;
        return (
          (mintA === tokenInMint.toString() && mintB === tokenOutMint.toString()) ||
          (mintA === tokenOutMint.toString() && mintB === tokenInMint.toString())
        );
      });

      if (!pool) {
        return null;
      }

      return {
        address: pool.address || pool.poolAddress,
        mintA: pool.mint_x || pool.tokenA?.mint,
        mintB: pool.mint_y || pool.tokenB?.mint,
        reserveA: pool.reserve_x || pool.tokenA?.amount,
        reserveB: pool.reserve_y || pool.tokenB?.amount,
        feeRate: pool.fee_rate || 0.003, // Default 0.3%
      };
    } catch (error) {
      console.error('[Meteora Service] Error fetching pools:', error);
      return null;
    }
  }

  private async calculateQuote(
    poolInfo: any,
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
      const isMintAIn = poolInfo.mintA === tokenInMint.toString();
      const reserveA = parseFloat(poolInfo.reserveA || '0');
      const reserveB = parseFloat(poolInfo.reserveB || '0');
      const feeRate = poolInfo.feeRate || 0.003;

      return calculateConstantProductQuote({
        reserveA,
        reserveB,
        amountIn,
        isReserveAIn: isMintAIn,
        feeRate,
      });
    } catch (error: any) {
      console.error('[Meteora Service] Error calculating quote:', error);
      throw new Error(`Quote calculation failed: ${error.message}`);
    }
  }

  private async buildSwapInstruction(
    _poolInfo: any,
    _userPublicKey: PublicKey,
    _tokenInMint: PublicKey,
    _tokenOutMint: PublicKey,
    _amountIn: bigint,
    _minAmountOut: bigint
  ): Promise<any> {
    throw new Error('Meteora swap instruction building not fully implemented. Please use Meteora SDK directly.');
  }
}
