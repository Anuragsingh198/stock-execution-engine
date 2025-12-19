import { Queue, QueueOptions } from 'bullmq';
import { RedisClient } from '../config/redis.config';

export class OrderQueue {
  private static instance: OrderQueue;
  private queue: Queue;

  private constructor() {
    const redisClient = RedisClient.getInstance();
    
    const queueOptions: QueueOptions = {
      connection: redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000,
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    };

    this.queue = new Queue('order-execution', queueOptions);
  }

  public static getInstance(): OrderQueue {
    if (!OrderQueue.instance) {
      OrderQueue.instance = new OrderQueue();
    }
    return OrderQueue.instance;
  }

  public async addOrder(orderId: string): Promise<void> {
    await this.queue.add(
      'execute-order',
      { orderId },
      {
        jobId: orderId,
      }
    );
  }

  public getQueue(): Queue {
    return this.queue;
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}

