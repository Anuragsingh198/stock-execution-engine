import { Worker, WorkerOptions } from 'bullmq';
import { OrderService } from '../services/order.service';
import { OrderRedisManager } from '../services/order.redis.manager';

export class OrderWorker {
  private static instance: OrderWorker;
  private orderWorkers: Map<string, Worker> = new Map();
  private orderService: OrderService;
  private orderRedisManager: OrderRedisManager;
  private readonly maxConcurrency: number;

  private constructor() {
    this.orderService = new OrderService();
    this.orderRedisManager = OrderRedisManager.getInstance();
    this.maxConcurrency = parseInt(process.env.QUEUE_MAX_CONCURRENCY || '10');
  }

  public static getInstance(): OrderWorker {
    if (!OrderWorker.instance) {
      OrderWorker.instance = new OrderWorker();
    }
    return OrderWorker.instance;
  }

  public async createOrderWorker(orderId: string): Promise<void> {
    if (this.orderWorkers.has(orderId)) {
      return;
    }

    const redis = this.orderRedisManager.getOrderConnection(orderId);
    if (!redis) {
      console.log(`[OrderWorker] No Redis connection available for order ${orderId}`);
      return;
    }

    const workerOptions: WorkerOptions = {
      connection: redis,
      concurrency: this.maxConcurrency,
      limiter: {
        max: parseInt(process.env.QUEUE_RATE_LIMIT_PER_MINUTE || '100'),
        duration: 60000,
      },
    };

    const worker = new Worker('order-execution', (job) => this.processJob(job, orderId), workerOptions);
    this.setupEventHandlers(worker, orderId);
    this.orderWorkers.set(orderId, worker);

    console.log(`[OrderWorker] Created worker for order ${orderId}`);
  }

  public async closeOrderWorker(orderId: string): Promise<void> {
    const worker = this.orderWorkers.get(orderId);
    if (worker) {
      await worker.close();
      this.orderWorkers.delete(orderId);
      console.log(`[OrderWorker] Closed worker for order ${orderId}`);
    }
  }

  private async processJob(_job: any, orderId: string): Promise<void> {
    try {
      if (!this.orderRedisManager.isOrderConnectionActive(orderId)) {
        console.log(`[OrderWorker] Redis connection not active for order ${orderId}, skipping job processing`);
        return;
      }

      await this.orderService.executeOrder(orderId);
    } catch (error: any) {
      console.error(`[OrderWorker] Failed to process order ${orderId}:`, error);
      throw error;
    }
  }

  private setupEventHandlers(worker: Worker, orderId: string): void {
    worker.on('failed', (job, err) => {
      console.error(`[OrderWorker] Job ${job?.id} failed for order ${orderId}:`, err);
    });

    worker.on('error', (err) => {
      console.error(`[OrderWorker] Worker error for order ${orderId}:`, err);
    });
  }

  public getOrderWorker(orderId: string): Worker | undefined {
    return this.orderWorkers.get(orderId);
  }

  public async close(): Promise<void> {
    const closePromises = Array.from(this.orderWorkers.values()).map((worker) =>
      worker.close()
    );
    await Promise.all(closePromises);
    this.orderWorkers.clear();
    console.log('[OrderWorker] All workers closed');
  }
}

