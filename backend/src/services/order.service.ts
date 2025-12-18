import { v4 as uuidv4 } from 'uuid';
import { Order, OrderRequest, OrderStatus, OrderUpdate } from '../types/order.types';
import { OrderModel } from '../models/order.model';
import { DexRouterService } from './dex.router.service';
import { WebSocketManager } from '../utils/websocket.manager';

export class OrderService {
  private orderModel: OrderModel;
  private dexRouter: DexRouterService;
  private wsManager: WebSocketManager;
  private readonly EXECUTION_TIME_MIN = 2000; // 2 seconds
  private readonly EXECUTION_TIME_MAX = 3000; // 3 seconds

  constructor() {
    this.orderModel = new OrderModel();
    this.dexRouter = new DexRouterService();
    this.wsManager = WebSocketManager.getInstance();
  }

  /**
   * Create a new order with PENDING status
   */
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
    console.log(`[Order Service] Created order ${orderId} with status PENDING`);

    // Emit PENDING status update if WebSocket connection exists
    const pendingUpdate: OrderUpdate = {
      orderId,
      status: OrderStatus.PENDING,
      timestamp: now,
    };
    await this.wsManager.emit(orderId, pendingUpdate);

    return order;
  }

  /**
   * Execute order through full lifecycle
   */
  public async executeOrder(orderId: string): Promise<void> {
    try {
      // Step 1: Routing
      await this.updateOrderStatus(orderId, OrderStatus.ROUTING);
      const order = await this.orderModel.findById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      const orderRequest: OrderRequest = {
        tokenIn: order.tokenIn,
        tokenOut: order.tokenOut,
        amountIn: order.amountIn,
        slippageTolerance: order.slippageTolerance,
        minAmountOut: order.minAmountOut,
      };

      const bestQuote = await this.dexRouter.findBestRoute(orderRequest);

      // Step 2: Building transaction
      await this.updateOrderStatus(orderId, OrderStatus.BUILDING, {
        dexType: bestQuote.dex,
      });

      // Step 3: Submit transaction
      await this.updateOrderStatus(orderId, OrderStatus.SUBMITTED);

      // Step 4: Execute transaction (mock)
      const executionTime = this.EXECUTION_TIME_MIN + Math.random() * (this.EXECUTION_TIME_MAX - this.EXECUTION_TIME_MIN);
      await new Promise((resolve) => setTimeout(resolve, executionTime));

      // Step 5: Check slippage and confirm
      const finalPrice = this.applySlippageProtection(
        bestQuote.effectivePrice,
        order.slippageTolerance,
        bestQuote.quotePrice
      );

      const txHash = this.generateMockTxHash();

      await this.updateOrderStatus(orderId, OrderStatus.CONFIRMED, {
        executedPrice: finalPrice,
        txHash,
      });

      console.log(`[Order Service] Order ${orderId} executed successfully with price ${finalPrice}`);
    } catch (error: any) {
      console.error(`[Order Service] Order ${orderId} execution failed:`, error);
      await this.updateOrderStatus(orderId, OrderStatus.FAILED, {
        errorReason: error.message || 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update order status and emit WebSocket event
   */
  private async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    additionalData?: Partial<Order>
  ): Promise<void> {
    await this.orderModel.updateStatus(orderId, status, additionalData);

    const update: OrderUpdate = {
      orderId,
      status,
      dexType: additionalData?.dexType,
      executedPrice: additionalData?.executedPrice,
      txHash: additionalData?.txHash,
      errorReason: additionalData?.errorReason,
      timestamp: new Date(),
    };

    await this.wsManager.emit(orderId, update);
  }

  /**
   * Apply slippage protection logic
   */
  private applySlippageProtection(
    expectedPrice: string,
    slippageTolerance: number,
    quotePrice: string
  ): string {
    const expected = parseFloat(expectedPrice);
    const quoted = parseFloat(quotePrice);
    const slippagePercent = Math.abs((quoted - expected) / expected) * 100;

    if (slippagePercent > slippageTolerance) {
      // Apply maximum slippage protection
      const slippageMultiplier = 1 - slippageTolerance / 100;
      return (expected * slippageMultiplier).toFixed(8);
    }

    // Small random variance to simulate real execution
    const variance = 1 - (Math.random() * 0.001); // 0.1% max variance
    return (parseFloat(expectedPrice) * variance).toFixed(8);
  }

  /**
   * Generate mock transaction hash
   */
  private generateMockTxHash(): string {
    const chars = '0123456789abcdef';
    let hash = '0x';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  /**
   * Get order by ID
   */
  public async getOrder(orderId: string): Promise<Order | null> {
    return await this.orderModel.findById(orderId);
  }

  /**
   * Get all orders
   */
  public async getAllOrders(limit: number = 100, offset: number = 0): Promise<Order[]> {
    return await this.orderModel.findAll(limit, offset);
  }
}

