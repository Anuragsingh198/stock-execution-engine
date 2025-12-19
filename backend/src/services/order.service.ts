import { v4 as uuidv4 } from 'uuid';
import { VersionedTransaction } from '@solana/web3.js';
import { Order, OrderRequest, OrderStatus, OrderUpdate, DexQuote } from '../types/order.types';
import { OrderModel } from '../models/order.model';
import { DexRouterService } from './dex.router.service';
import { EventPublisher } from './event.publisher';
import { SolanaConfig } from '../config/solana.config';

export class OrderService {
  private orderModel: OrderModel;
  private dexRouter: DexRouterService;
  private eventPublisher: EventPublisher;
  private solanaConfig: SolanaConfig;
  private readonly CONFIRMATION_TIMEOUT = 60000; // 60 seconds
  private statusHistory: Map<string, OrderStatus[]> = new Map(); // Track status history per order

  constructor() {
    this.orderModel = new OrderModel();
    this.dexRouter = new DexRouterService();
    this.eventPublisher = EventPublisher.getInstance();
    this.solanaConfig = SolanaConfig.getInstance();
  }

  public async createOrder(orderRequest: OrderRequest): Promise<Order> {
    const orderId = uuidv4();
    const now = new Date();

    const order: Order = {
      orderId,
      tokenIn: orderRequest.tokenIn,
      tokenOut: orderRequest.tokenOut,
      amountIn: orderRequest.amountIn,
      slippageTolerance: orderRequest.slippageTolerance,
      minAmountOut: orderRequest.minAmountOut,
      status: OrderStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    await this.orderModel.create(order);
    await this.updateOrderStatus(orderId, OrderStatus.PENDING);
    
    // Small delay to ensure database transaction is committed
    // This is especially important in Docker environments with network latency
    await new Promise(resolve => setTimeout(resolve, 50));

    return order;
  }

  public async executeOrder(orderId: string): Promise<void> {
    try {
      await this.updateOrderStatus(orderId, OrderStatus.ROUTING);
      const order = await this.orderModel.findById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      const hasBalance = await this.solanaConfig.hasSufficientBalance(0.01);
      if (!hasBalance) {
        throw new Error('Insufficient SOL balance. Please fund your wallet via https://faucet.solana.com');
      }

      const orderRequest: OrderRequest = {
        tokenIn: order.tokenIn,
        tokenOut: order.tokenOut,
        amountIn: order.amountIn,
        slippageTolerance: order.slippageTolerance,
        minAmountOut: order.minAmountOut,
      };

      let bestQuote: DexQuote;
      try {
        bestQuote = await this.dexRouter.findBestRoute(orderRequest);
      } catch (error: any) {
        throw new Error(`DEX routing failed: ${error.message}`);
      }

      await this.updateOrderStatus(orderId, OrderStatus.BUILDING, {
        dexType: bestQuote.dex,
      });

      let transaction: VersionedTransaction;
      try {
        transaction = await this.dexRouter.buildSwapTransaction(orderRequest, bestQuote);
      } catch (error: any) {
        throw new Error(`Transaction building failed: ${error.message}`);
      }

      let txHash: string;
      try {
        txHash = await this.signAndSubmitTransaction(transaction);
      } catch (error: any) {
        throw new Error(`Transaction submission failed: ${error.message}`);
      }
      
      await this.updateOrderStatus(orderId, OrderStatus.SUBMITTED, {
        txHash,
      });

      const confirmed = await this.waitForConfirmation(txHash);

      if (!confirmed) {
        throw new Error('Transaction confirmation timeout');
      }

      const finalPrice = this.applySlippageProtection(
        bestQuote.effectivePrice,
        order.slippageTolerance,
        bestQuote.quotePrice
      );

      await this.updateOrderStatus(orderId, OrderStatus.CONFIRMED, {
        executedPrice: finalPrice,
        txHash,
      });
    } catch (error: any) {
      console.error(`[Order Service] Order ${orderId} execution failed:`, error);
      
      const errorMessage = error.message || 'Unknown error';
      
      // Publish FAILED status event - WebSocket worker will handle delivery
      try {
        await this.updateOrderStatus(orderId, OrderStatus.FAILED, {
          errorReason: errorMessage,
        });
      } catch (statusError: any) {
        console.error(`[Order Service] Failed to update status to FAILED:`, statusError);
        // Still try to update DB directly as fallback
        try {
          await this.orderModel.updateStatus(orderId, OrderStatus.FAILED, {
            errorReason: errorMessage,
          });
        } catch (dbError: any) {
          console.error(`[Order Service] Database update for FAILED status also failed:`, dbError);
        }
      }
      
      throw error;
    }
  }

  private async signAndSubmitTransaction(transaction: VersionedTransaction): Promise<string> {
    try {
      const wallet = this.solanaConfig.getWallet();
      const connection = this.solanaConfig.getConnection();

      transaction.sign([wallet]);

      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
      });

      return signature;
    } catch (error: any) {
      console.error('[Order Service] Transaction submission error:', error);
      throw new Error(`Transaction submission failed: ${error.message}`);
    }
  }

  private async waitForConfirmation(signature: string): Promise<boolean> {
    try {
      const connection = this.solanaConfig.getConnection();

      const confirmation = await Promise.race([
        connection.confirmTransaction(signature, 'confirmed'),
        new Promise<null>((resolve) => 
          setTimeout(() => resolve(null), this.CONFIRMATION_TIMEOUT)
        ),
      ]);

      if (!confirmation) {
        return false;
      }

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return true;
    } catch (error: any) {
      console.error('[Order Service] Confirmation error:', error);
      throw error;
    }
  }

  /**
   * Update order status and publish event to status-specific queue
   * This is now event-driven - the WebSocket worker will handle delivery
   */
  private async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    additionalData?: Partial<Order>
  ): Promise<void> {
    const timestamp = new Date();
    
    if (!this.statusHistory.has(orderId)) {
      this.statusHistory.set(orderId, []);
    }
    const history = this.statusHistory.get(orderId)!;
    history.push(status);
    
    // Update database first
    try {
      await this.orderModel.updateStatus(orderId, status, additionalData);
    } catch (dbError: any) {
      console.error(`[Order Service] Database update failed:`, dbError);
      // Continue even if DB update fails - we still want to emit the event
    }

    // Publish event to status-specific queue (non-blocking, event-driven)
    const update: OrderUpdate = {
      orderId,
      status,
      dexType: additionalData?.dexType,
      executedPrice: additionalData?.executedPrice,
      txHash: additionalData?.txHash,
      errorReason: additionalData?.errorReason,
      timestamp: timestamp,
    };

    try {
      // Publish to queue - WebSocket worker will handle delivery
      // This is non-blocking and allows parallel processing
      await this.eventPublisher.publishStatusUpdate(update);
    } catch (error: any) {
      console.error(`[Order Service] Failed to publish status update:`, error);
      // Don't throw - order execution should continue even if event publishing fails
    }
  }

  private applySlippageProtection(
    expectedPrice: string,
    slippageTolerance: number,
    quotePrice: string
  ): string {
    const expected = parseFloat(expectedPrice);
    const quoted = parseFloat(quotePrice);
    const slippagePercent = Math.abs((quoted - expected) / expected) * 100;

    if (slippagePercent > slippageTolerance) {
      const slippageMultiplier = 1 - slippageTolerance / 100;
      return (expected * slippageMultiplier).toFixed(8);
    }

    const variance = 1 - (Math.random() * 0.001);
    return (parseFloat(expectedPrice) * variance).toFixed(8);
  }

  public async getOrder(orderId: string): Promise<Order | null> {
    return await this.orderModel.findById(orderId);
  }

  public async getAllOrders(limit: number = 100, offset: number = 0): Promise<Order[]> {
    return await this.orderModel.findAll(limit, offset);
  }
}

