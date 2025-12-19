import { Queue, QueueOptions } from 'bullmq';
import { RedisClient } from '../config/redis.config';
import { OrderStatus, OrderUpdate } from '../types/order.types';

/**
 * Event Publisher Service
 * 
 * Publishes order status updates to status-specific queues for reliable,
 * event-driven WebSocket delivery. Each order status has its own queue
 * to enable parallel processing and better scalability.
 */
export class EventPublisher {
  private static instance: EventPublisher;
  private queues: Map<OrderStatus, Queue> = new Map();
  private redisClient: ReturnType<typeof RedisClient.getInstance>;

  private constructor() {
    this.redisClient = RedisClient.getInstance();
    this.initializeQueues();
  }

  public static getInstance(): EventPublisher {
    if (!EventPublisher.instance) {
      EventPublisher.instance = new EventPublisher();
    }
    return EventPublisher.instance;
  }

  /**
   * Initialize separate queues for each order status
   */
  private initializeQueues(): void {
    const statuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.ROUTING,
      OrderStatus.BUILDING,
      OrderStatus.SUBMITTED,
      OrderStatus.CONFIRMED,
      OrderStatus.FAILED,
    ];

    const queueOptions: QueueOptions = {
      connection: this.redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
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

    statuses.forEach((status) => {
      const queueName = `order-status-${status}`;
      const queue = new Queue(queueName, queueOptions);
      this.queues.set(status, queue);
    });
  }

  /**
   * Publish an order status update to the appropriate status queue
   * 
   * @param update - Order update event
   * @returns Promise that resolves when the event is published
   */
  public async publishStatusUpdate(update: OrderUpdate): Promise<void> {
    const queue = this.queues.get(update.status);
    if (!queue) {
      console.error(`[EventPublisher] No queue found for status: ${update.status}`);
      return;
    }

    try {
      // Use orderId as jobId to prevent duplicate events
      // Add timestamp to jobId to allow multiple events with same status
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
    } catch (error: any) {
      console.error(`[EventPublisher] Failed to publish status update:`, error);
      throw error;
    }
  }

  /**
   * Get priority for different status types
   * Higher priority = processed first
   */
  private getPriority(status: OrderStatus): number {
    const priorities: Record<OrderStatus, number> = {
      [OrderStatus.FAILED]: 10,      // Highest priority - critical errors
      [OrderStatus.CONFIRMED]: 9,     // High priority - successful completion
      [OrderStatus.SUBMITTED]: 8,     // High priority - transaction submitted
      [OrderStatus.BUILDING]: 7,      // Medium-high priority
      [OrderStatus.ROUTING]: 6,       // Medium priority
      [OrderStatus.PENDING]: 5,       // Lower priority - initial state
    };
    return priorities[status] || 5;
  }

  /**
   * Get a specific status queue (for monitoring/debugging)
   */
  public getQueue(status: OrderStatus): Queue | undefined {
    return this.queues.get(status);
  }

  /**
   * Get all queues (for monitoring/debugging)
   */
  public getAllQueues(): Map<OrderStatus, Queue> {
    return this.queues;
  }

  /**
   * Close all queues gracefully
   */
  public async close(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map((queue) =>
      queue.close()
    );
    await Promise.all(closePromises);
    this.queues.clear();
  }
}
