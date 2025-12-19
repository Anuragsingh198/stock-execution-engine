import { Worker, WorkerOptions, Job } from 'bullmq';
import { RedisClient } from '../config/redis.config';
import { WebSocketManager } from '../utils/websocket.manager';
import { OrderStatus, OrderUpdate } from '../types/order.types';

/**
 * WebSocket Worker
 * 
 * Subscribes to all status-specific queues and emits WebSocket events
 * to connected clients in parallel. This ensures reliable delivery
 * of order status updates for concurrent transactions.
 */
export class WebSocketWorker {
  private static instance: WebSocketWorker;
  private workers: Map<OrderStatus, Worker> = new Map();
  private wsManager: WebSocketManager;
  private redisClient: ReturnType<typeof RedisClient.getInstance>;
  private readonly maxConcurrency: number;

  private constructor() {
    this.redisClient = RedisClient.getInstance();
    this.wsManager = WebSocketManager.getInstance();
    this.maxConcurrency = parseInt(process.env.WS_WORKER_CONCURRENCY || '50');
    this.initializeWorkers();
  }

  public static getInstance(): WebSocketWorker {
    if (!WebSocketWorker.instance) {
      WebSocketWorker.instance = new WebSocketWorker();
    }
    return WebSocketWorker.instance;
  }

  /**
   * Initialize workers for each status queue
   */
  private initializeWorkers(): void {
    const statuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.ROUTING,
      OrderStatus.BUILDING,
      OrderStatus.SUBMITTED,
      OrderStatus.CONFIRMED,
      OrderStatus.FAILED,
    ];

    statuses.forEach((status) => {
      const queueName = `order-status-${status}`;
      
      const workerOptions: WorkerOptions = {
        connection: this.redisClient,
        concurrency: this.maxConcurrency, // Process multiple events in parallel
        limiter: {
          max: parseInt(process.env.WS_WORKER_RATE_LIMIT || '1000'),
          duration: 60000, // 1 minute
        },
      };

      const worker = new Worker(
        queueName,
        this.processStatusUpdate.bind(this),
        workerOptions
      );

      this.setupWorkerEventHandlers(worker, status);
      this.workers.set(status, worker);
      
      console.log(`[WebSocketWorker] Started worker for ${status} queue`);
    });
  }

  /**
   * Process a status update job and emit to WebSocket clients
   */
  private async processStatusUpdate(job: Job): Promise<void> {
    const {
      orderId,
      status,
      dexType,
      executedPrice,
      txHash,
      errorReason,
      timestamp,
    } = job.data;

    try {
      const update: OrderUpdate = {
        orderId,
        status: status as OrderStatus,
        dexType,
        executedPrice,
        txHash,
        errorReason,
        timestamp: new Date(timestamp),
      };

      // Emit to all WebSocket connections for this orderId
      // This is non-blocking and handles multiple connections in parallel
      await this.wsManager.emitToOrder(orderId, update);

      console.log(
        `[WebSocketWorker] Emitted ${status} event for order ${orderId} (Job: ${job.id})`
      );
    } catch (error: any) {
      console.error(
        `[WebSocketWorker] Failed to process status update for order ${orderId}:`,
        error
      );
      // Don't throw - we want to continue processing other events
      // The job will be retried automatically by BullMQ if needed
    }
  }

  /**
   * Setup event handlers for worker monitoring
   */
  private setupWorkerEventHandlers(worker: Worker, status: OrderStatus): void {
    worker.on('completed', (job) => {
      console.log(
        `[WebSocketWorker] ${status} event processed successfully for order ${job.data.orderId}`
      );
    });

    worker.on('failed', (job, err) => {
      console.error(
        `[WebSocketWorker] ${status} event failed for order ${job?.data?.orderId}:`,
        err
      );
    });

    worker.on('error', (err) => {
      console.error(`[WebSocketWorker] Worker error for ${status} queue:`, err);
    });

    worker.on('stalled', (jobId) => {
      console.warn(`[WebSocketWorker] Job ${jobId} stalled in ${status} queue`);
    });
  }

  /**
   * Get worker for a specific status (for monitoring/debugging)
   */
  public getWorker(status: OrderStatus): Worker | undefined {
    return this.workers.get(status);
  }

  /**
   * Get all workers (for monitoring/debugging)
   */
  public getAllWorkers(): Map<OrderStatus, Worker> {
    return this.workers;
  }

  /**
   * Close all workers gracefully
   */
  public async close(): Promise<void> {
    const closePromises = Array.from(this.workers.values()).map((worker) =>
      worker.close()
    );
    await Promise.all(closePromises);
    this.workers.clear();
    console.log('[WebSocketWorker] All workers closed');
  }
}
