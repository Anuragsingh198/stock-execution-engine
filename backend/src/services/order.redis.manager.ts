import Redis from "ioredis";

export class OrderRedisManager {
  private static instance: OrderRedisManager;
  private orderConnections: Map<string, Redis> = new Map();
  private orderTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly CONNECTION_TIMEOUT_MS = 15 * 60 * 1000;

  private constructor() {}

  public static getInstance(): OrderRedisManager {
    if (!OrderRedisManager.instance) {
      OrderRedisManager.instance = new OrderRedisManager();
    }
    return OrderRedisManager.instance;
  }

  public async createOrderConnection(orderId: string): Promise<Redis> {
    if (this.orderConnections.has(orderId)) {
      this.resetTimeout(orderId);
      return this.orderConnections.get(orderId)!;
    }

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is not defined");
    }

    const isSSL = redisUrl.startsWith('rediss://');

    let redisConfig: any = {
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      enableReadyCheck: true,
      connectTimeout: 10000,
      lazyConnect: false,
    };

    if (isSSL && redisUrl.includes('@')) {
      try {
        const url = new URL(redisUrl);
        redisConfig.host = url.hostname;
        redisConfig.port = parseInt(url.port) || 6379;
        redisConfig.password = url.password || url.username;
        redisConfig.username = url.username === 'default' ? undefined : url.username;
        redisConfig.tls = {
          rejectUnauthorized: false,
        };
      } catch (error) {
        console.error('[OrderRedisManager] Failed to parse URL:', error);
        throw new Error(`Invalid Redis URL format: ${error}`);
      }
    } else {
      redisConfig.tls = isSSL ? { rejectUnauthorized: false } : undefined;
    }

    const redis = isSSL && redisUrl.includes('@') ? new Redis(redisConfig) : new Redis(redisUrl, redisConfig);

    redis.on("connect", () => {
      console.log(`[OrderRedisManager] Redis connected for order ${orderId}`);
    });

    redis.on("ready", () => {
      console.log(`[OrderRedisManager] Redis ready for order ${orderId}`);
    });

    redis.on("error", (err) => {
      console.error(`[OrderRedisManager] Redis error for order ${orderId}:`, err);
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Redis connection timeout for order ${orderId}`));
      }, 10000);

      redis.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      redis.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    this.orderConnections.set(orderId, redis);
    this.setTimeout(orderId);

    console.log(`[OrderRedisManager] Created Redis connection for order ${orderId}`);
    return redis;
  }

  public getOrderConnection(orderId: string): Redis | null {
    return this.orderConnections.get(orderId) || null;
  }

  public isOrderConnectionActive(orderId: string): boolean {
    const connection = this.orderConnections.get(orderId);
    return connection !== undefined && connection.status === 'ready';
  }

  public resetTimeout(orderId: string): void {
    const existingTimeout = this.orderTimeouts.get(orderId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    this.setTimeout(orderId);
    console.log(`[OrderRedisManager] Reset timeout for order ${orderId}`);
  }

  private setTimeout(orderId: string): void {
    const timeout = setTimeout(async () => {
      await this.closeOrderConnection(orderId);
    }, this.CONNECTION_TIMEOUT_MS);

    this.orderTimeouts.set(orderId, timeout);
  }

  public async closeOrderConnection(orderId: string): Promise<void> {
    const connection = this.orderConnections.get(orderId);
    const timeout = this.orderTimeouts.get(orderId);

    if (timeout) {
      clearTimeout(timeout);
      this.orderTimeouts.delete(orderId);
    }

    if (connection) {
      try {
        console.log(`[OrderRedisManager] Stopping status polling for order ${orderId}`);

        const { EventPublisher } = await import('./event.publisher');
        const { WebSocketWorker } = await import('../workers/websocket.worker');
        const { OrderWorker } = await import('../workers/order.worker');
        const { OrderQueue } = await import('../queue/order.queue');

        const eventPublisher = EventPublisher.getInstance();
        const wsWorker = WebSocketWorker.getInstance();
        const orderWorker = OrderWorker.getInstance();
        const orderQueue = OrderQueue.getInstance();

        await wsWorker.closeOrderWorkers(orderId);
        await orderWorker.closeOrderWorker(orderId);
        await orderQueue.closeOrderQueue(orderId);
        await eventPublisher.closeOrderQueues(orderId);

        await this.clearOrderRedisState(orderId, connection);

        await connection.quit();
        console.log(`[OrderRedisManager] Closed Redis connection for order ${orderId} after 15 minutes`);
      } catch (error) {
        console.error(`[OrderRedisManager] Error closing Redis connection for order ${orderId}:`, error);
        connection.disconnect();
      } finally {
        this.orderConnections.delete(orderId);
      }
    }
  }

  private async clearOrderRedisState(orderId: string, redis: Redis): Promise<void> {
    try {
      await redis.del(`bull:order-execution:${orderId}`);

      const statusQueues = [
        `bull:order-status-pending:${orderId}`,
        `bull:order-status-routing:${orderId}`,
        `bull:order-status-building:${orderId}`,
        `bull:order-status-submitted:${orderId}`,
        `bull:order-status-confirmed:${orderId}`,
        `bull:order-status-failed:${orderId}`,
      ];

      for (const queueKey of statusQueues) {
        await redis.del(queueKey);
      }

      const orderKeys = await redis.keys(`*${orderId}*`);
      if (orderKeys.length > 0) {
        await redis.del(...orderKeys);
      }

      console.log(`[OrderRedisManager] Cleared Redis state for order ${orderId}`);
    } catch (error) {
      console.error(`[OrderRedisManager] Error clearing Redis state for order ${orderId}:`, error);
    }
  }

  public async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.orderConnections.keys()).map(orderId =>
      this.closeOrderConnection(orderId)
    );

    await Promise.all(closePromises);
    console.log('[OrderRedisManager] All Redis connections closed');
  }

  public getActiveConnectionCount(): number {
    return this.orderConnections.size;
  }

  public getActiveOrderIds(): string[] {
    return Array.from(this.orderConnections.keys());
  }
}
