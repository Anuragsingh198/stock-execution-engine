import Redis from "ioredis";

export class RedisClient {
  private static instance: Redis;

  private constructor() {}

  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      if (!process.env.REDIS_URL) {
        throw new Error("REDIS_URL is not defined");
      }

      RedisClient.instance = new Redis(process.env.REDIS_URL, {
        tls: {}, 
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });

      RedisClient.instance.on("connect", () => {
        console.log("Redis connected");
      });

      RedisClient.instance.on("error", (err) => {
        console.error("Redis error:", err);
      });
    }

    return RedisClient.instance;
  }
}
