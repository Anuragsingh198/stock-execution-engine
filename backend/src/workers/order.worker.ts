import { Worker, WorkerOptions } from 'bullmq';
import { RedisClient } from '../config/redis.config';
import { OrderService } from '../services/order.service';

export class OrderWorker {
  private static instance: OrderWorker;
  private worker: Worker;
  private orderService: OrderService;

  private constructor() {
    this.orderService = new OrderService();
    
    const redisClient = RedisClient.getInstance();
    const maxConcurrency = parseInt(process.env.QUEUE_MAX_CONCURRENCY || '10');

    const workerOptions: WorkerOptions = {
      connection: redisClient,
      concurrency: maxConcurrency,
      limiter: {
        max: parseInt(process.env.QUEUE_RATE_LIMIT_PER_MINUTE || '100'),
        duration: 60000, // 1 minute
      },
    };

    this.worker = new Worker('order-execution', this.processJob.bind(this), workerOptions);
    this.setupEventHandlers();
    console.log(`Order worker initialized with concurrency: ${maxConcurrency}`);
  }

  public static getInstance(): OrderWorker {
    if (!OrderWorker.instance) {
      OrderWorker.instance = new OrderWorker();
    }
    return OrderWorker.instance;
  }

  private async processJob(job: any): Promise<void> {
    const { orderId } = job.data;
    console.log(`[Order Worker] Processing order ${orderId}`);

    try {
      await this.orderService.executeOrder(orderId);
      console.log(`[Order Worker] Successfully processed order ${orderId}`);
    } catch (error: any) {
      console.error(`[Order Worker] Failed to process order ${orderId}:`, error);
      throw error; // BullMQ will handle retry
    }
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      console.log(`[Order Worker] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[Order Worker] Job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (err) => {
      console.error('[Order Worker] Worker error:', err);
    });
  }

  public getWorker(): Worker {
    return this.worker;
  }

  public async close(): Promise<void> {
    await this.worker.close();
  }
}

