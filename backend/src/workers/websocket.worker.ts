import { Worker, WorkerOptions, Job } from 'bullmq';
import { WebSocketManager } from '../utils/websocket.manager';
import { OrderStatus, OrderUpdate } from '../types/order.types';
import { OrderRedisManager } from '../services/order.redis.manager';

export class WebSocketWorker {
  private static instance: WebSocketWorker;
  private orderWorkers: Map<string, Map<OrderStatus, Worker>> = new Map();
  private wsManager: WebSocketManager;
  private orderRedisManager: OrderRedisManager;
  private readonly maxConcurrency: number;

  private constructor() {
    this.orderRedisManager = OrderRedisManager.getInstance();
    this.wsManager = WebSocketManager.getInstance();
    this.maxConcurrency = parseInt(process.env.WS_WORKER_CONCURRENCY || '50');
  }

  public static getInstance(): WebSocketWorker {
    if (!WebSocketWorker.instance) {
      WebSocketWorker.instance = new WebSocketWorker();
    }
    return WebSocketWorker.instance;
  }

  public async createOrderWorkers(orderId: string): Promise<void> {
    if (this.orderWorkers.has(orderId)) {
      return;
    }

    const redis = this.orderRedisManager.getOrderConnection(orderId);
    if (!redis) {
      console.log(`[WebSocketWorker] No Redis connection available for order ${orderId}`);
      return;
    }

    const statuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.ROUTING,
      OrderStatus.BUILDING,
      OrderStatus.SUBMITTED,
      OrderStatus.CONFIRMED,
      OrderStatus.FAILED,
    ];

    const orderWorkers = new Map<OrderStatus, Worker>();

    statuses.forEach((status) => {
      const queueName = `order-status-${status}`;

      const workerOptions: WorkerOptions = {
        connection: redis,
        concurrency: this.maxConcurrency,
        limiter: {
          max: parseInt(process.env.WS_WORKER_RATE_LIMIT || '1000'),
          duration: 60000,
        },
      };

      const worker = new Worker(
        queueName,
        (job) => this.processStatusUpdate(job, orderId),
        workerOptions
      );

      this.setupWorkerEventHandlers(worker, status, orderId);
      orderWorkers.set(status, worker);

      console.log(`[WebSocketWorker] Started worker for ${status} queue (order: ${orderId})`);
    });

    this.orderWorkers.set(orderId, orderWorkers);
  }

  public async closeOrderWorkers(orderId: string): Promise<void> {
    const orderWorkers = this.orderWorkers.get(orderId);
    if (orderWorkers) {
      const closePromises = Array.from(orderWorkers.values()).map((worker) =>
        worker.close()
      );
      await Promise.all(closePromises);
      this.orderWorkers.delete(orderId);
      console.log(`[WebSocketWorker] Closed workers for order ${orderId}`);
    }
  }

  private async processStatusUpdate(job: Job, orderId: string): Promise<void> {
    const {
      status,
      dexType,
      executedPrice,
      txHash,
      errorReason,
      timestamp,
    } = job.data;

    try {
      if (!this.orderRedisManager.isOrderConnectionActive(orderId)) {
        console.log(`[WebSocketWorker] Redis connection not active for order ${orderId}, skipping status update`);
        return;
      }

      const update: OrderUpdate = {
        orderId,
        status: status as OrderStatus,
        dexType,
        executedPrice,
        txHash,
        errorReason,
        timestamp: new Date(timestamp),
      };

      await this.wsManager.emitToOrder(orderId, update);

      console.log(
        `[WebSocketWorker] Emitted ${status} event for order ${orderId} (Job: ${job.id})`
      );
    } catch (error: any) {
      console.error(
        `[WebSocketWorker] Failed to process status update for order ${orderId}:`,
        error
      );
    }
  }

  private setupWorkerEventHandlers(worker: Worker, status: OrderStatus, orderId: string): void {
    worker.on('completed', (_job) => {
      console.log(
        `[WebSocketWorker] ${status} event processed successfully for order ${orderId}`
      );
    });

    worker.on('failed', (_job, err) => {
      console.error(
        `[WebSocketWorker] ${status} event failed for order ${orderId}:`,
        err
      );
    });

    worker.on('error', (err) => {
      console.error(`[WebSocketWorker] Worker error for ${status} queue (order: ${orderId}):`, err);
    });

    worker.on('stalled', (jobId) => {
      console.warn(`[WebSocketWorker] Job ${jobId} stalled in ${status} queue (order: ${orderId})`);
    });
  }

  public getOrderWorker(orderId: string, status: OrderStatus): Worker | undefined {
    const orderWorkers = this.orderWorkers.get(orderId);
    return orderWorkers?.get(status);
  }

  public getAllOrderWorkers(orderId: string): Map<OrderStatus, Worker> | undefined {
    return this.orderWorkers.get(orderId);
  }

  public async close(): Promise<void> {
    const closePromises = Array.from(this.orderWorkers.values()).map((orderWorkers) =>
      Promise.all(Array.from(orderWorkers.values()).map(worker => worker.close()))
    );
    await Promise.all(closePromises);
    this.orderWorkers.clear();
    console.log('[WebSocketWorker] All workers closed');
  }
}
