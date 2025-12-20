import { Queue, QueueOptions } from 'bullmq';
import { OrderRedisManager } from '../services/order.redis.manager';

export class OrderQueue {
  private static instance: OrderQueue;
  private orderQueues: Map<string, Queue> = new Map();
  private orderRedisManager: OrderRedisManager;

  private constructor() {
    this.orderRedisManager = OrderRedisManager.getInstance();
  }

  public static getInstance(): OrderQueue {
    if (!OrderQueue.instance) {
      OrderQueue.instance = new OrderQueue();
    }
    return OrderQueue.instance;
  }

  private async getOrderQueue(orderId: string): Promise<Queue> {
    if (this.orderQueues.has(orderId)) {
      return this.orderQueues.get(orderId)!;
    }

    const redis = this.orderRedisManager.getOrderConnection(orderId);
    if (!redis) {
      throw new Error(`No Redis connection available for order ${orderId}`);
    }

    const queueOptions: QueueOptions = {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
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

    const queue = new Queue('order-execution', queueOptions);
    this.orderQueues.set(orderId, queue);
    return queue;
  }

  public async addOrder(orderId: string): Promise<void> {
    const queue = await this.getOrderQueue(orderId);
    await queue.add(
      'execute-order',
      { orderId },
      {
        jobId: orderId,
      }
    );
  }

  public getOrderQueueInstance(orderId: string): Queue | undefined {
    return this.orderQueues.get(orderId);
  }

  public async closeOrderQueue(orderId: string): Promise<void> {
    const queue = this.orderQueues.get(orderId);
    if (queue) {
      await queue.close();
      this.orderQueues.delete(orderId);
      console.log(`[OrderQueue] Closed queue for order ${orderId}`);
    }
  }

  public async close(): Promise<void> {
    const closePromises = Array.from(this.orderQueues.values()).map((queue) =>
      queue.close()
    );
    await Promise.all(closePromises);
    this.orderQueues.clear();
    console.log('[OrderQueue] All queues closed');
  }
}

