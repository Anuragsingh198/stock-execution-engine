import { Queue, QueueOptions } from 'bullmq';
import { OrderStatus, OrderUpdate } from '../types/order.types';
import { OrderRedisManager } from './order.redis.manager';

export class EventPublisher {
  private static instance: EventPublisher;
  private orderQueues: Map<string, Map<OrderStatus, Queue>> = new Map();
  private orderRedisManager: OrderRedisManager;

  private constructor() {
    this.orderRedisManager = OrderRedisManager.getInstance();
  }

  public static getInstance(): EventPublisher {
    if (!EventPublisher.instance) {
      EventPublisher.instance = new EventPublisher();
    }
    return EventPublisher.instance;
  }

  private async getOrderQueues(orderId: string): Promise<Map<OrderStatus, Queue>> {
    if (this.orderQueues.has(orderId)) {
      return this.orderQueues.get(orderId)!;
    }

    if (!this.orderRedisManager.isOrderConnectionActive(orderId)) {
      console.log(`[EventPublisher] Redis connection not active for order ${orderId}, skipping event publication`);
      throw new Error(`Redis connection not available for order ${orderId}`);
    }

    const redis = this.orderRedisManager.getOrderConnection(orderId);
    if (!redis) {
      throw new Error(`No Redis connection available for order ${orderId}`);
    }

    const statuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.ROUTING,
      OrderStatus.BUILDING,
      OrderStatus.SUBMITTED,
      OrderStatus.CONFIRMED,
      OrderStatus.FAILED,
    ];

    const queueOptions: QueueOptions = {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    };

    const orderQueues = new Map<OrderStatus, Queue>();

    statuses.forEach((status) => {
      const queueName = `order-status-${status}`;
      const queue = new Queue(queueName, queueOptions);
      orderQueues.set(status, queue);
    });

    this.orderQueues.set(orderId, orderQueues);
    return orderQueues;
  }

  public async publishStatusUpdate(update: OrderUpdate): Promise<void> {
    try {
      const orderQueues = await this.getOrderQueues(update.orderId);
      const queue = orderQueues.get(update.status);

      if (!queue) {
        console.error(`[EventPublisher] No queue found for status: ${update.status} and order: ${update.orderId}`);
        return;
      }

      const jobId = `${update.orderId}-${update.status}-${Date.now()}`;

      await queue.add(
        'status-update',
        {
          orderId: update.orderId,
          status: update.status,
          dexType: update.dexType,
          executedPrice: update.executedPrice,
          txHash: update.txHash,
          errorReason: update.errorReason,
          timestamp: update.timestamp.toISOString(),
        },
        {
          jobId,
          priority: this.getPriority(update.status),
        }
      );

      console.log(`[EventPublisher] Published ${update.status} event for order ${update.orderId}`);

      this.orderRedisManager.resetTimeout(update.orderId);
    } catch (error: any) {
      console.error(`[EventPublisher] Failed to publish status update for order ${update.orderId}:`, error);
    }
  }

  private getPriority(status: OrderStatus): number {
    const priorities: Record<OrderStatus, number> = {
      [OrderStatus.FAILED]: 10,
      [OrderStatus.CONFIRMED]: 9,
      [OrderStatus.SUBMITTED]: 8,
      [OrderStatus.BUILDING]: 7,
      [OrderStatus.ROUTING]: 6,
      [OrderStatus.PENDING]: 5,
    };
    return priorities[status] || 5;
  }

  public async getOrderQueue(orderId: string, status: OrderStatus): Promise<Queue | undefined> {
    try {
      const orderQueues = await this.getOrderQueues(orderId);
      return orderQueues.get(status);
    } catch {
      return undefined;
    }
  }

  public async getAllOrderQueues(orderId: string): Promise<Map<OrderStatus, Queue> | undefined> {
    try {
      return await this.getOrderQueues(orderId);
    } catch {
      return undefined;
    }
  }

  public async closeOrderQueues(orderId: string): Promise<void> {
    const orderQueues = this.orderQueues.get(orderId);
    if (orderQueues) {
      const closePromises = Array.from(orderQueues.values()).map((queue) =>
        queue.close()
      );
      await Promise.all(closePromises);
      this.orderQueues.delete(orderId);
      console.log(`[EventPublisher] Closed queues for order ${orderId}`);
    }
  }

  public async close(): Promise<void> {
    const closePromises = Array.from(this.orderQueues.values()).map((orderQueues) =>
      Promise.all(Array.from(orderQueues.values()).map(queue => queue.close()))
    );
    await Promise.all(closePromises);
    this.orderQueues.clear();
  }
}
