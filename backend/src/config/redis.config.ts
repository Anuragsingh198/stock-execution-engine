import Redis from "ioredis";

export class RedisClient {
  private static instance: Redis;

  private constructor() {}

  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      if (!process.env.REDIS_URL) {
        throw new Error("REDIS_URL is not defined");
      }
      
      const redisUrl = process.env.REDIS_URL.trim();
      console.log(`[Redis] Connecting to: ${redisUrl.substring(0, 20)}...`); // Log first 20 chars for debugging
      
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
          // Upstash format: rediss://default:password@host:port
          // username is "default", password is the token
          redisConfig.password = url.password || url.username;
          redisConfig.username = url.username === 'default' ? undefined : url.username;
          redisConfig.tls = {
            rejectUnauthorized: false, // Upstash uses self-signed certificates
          };
          
          console.log(`[Redis] Parsed config - Host: ${redisConfig.host}, Port: ${redisConfig.port}`);
          
          RedisClient.instance = new Redis(redisConfig);
        } catch (error) {
          console.error('[Redis] Failed to parse URL, error:', error);
          throw new Error(`Invalid Redis URL format: ${error}`);
        }
      } else {
        // For non-SSL or simple URLs, use URL directly
        redisConfig.tls = isSSL ? { rejectUnauthorized: false } : undefined;
        RedisClient.instance = new Redis(redisUrl, redisConfig);
      }

      RedisClient.instance.on("connect", () => {
        console.log("✓ Redis connected successfully");
      });

      RedisClient.instance.on("ready", () => {
        console.log("✓ Redis ready");
      });

      RedisClient.instance.on("error", (err) => {
        console.error("Redis error:", err);
      });
    }

    return RedisClient.instance;
  }
}
