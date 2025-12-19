import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { registerOrderRoutes } from './routes/orders.routes';
import { OrderWorker } from './workers/order.worker';
import { WebSocketWorker } from './workers/websocket.worker';
import { Database } from './config/database.config';
import { RedisClient } from './config/redis.config';
import dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await fastify.register(websocket);

  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date() };
  });

  await fastify.register(registerOrderRoutes);

  return fastify;
}

async function start() {
  try {
    const db = Database.getInstance();
    await db.query('SELECT 1'); 
    console.log('✓ Database connected');
    const redis = RedisClient.getInstance();
    try {
      await redis.ping();
      console.log('✓ Redis connected');
    } catch (error: any) {
      console.error('\n❌ Redis connection failed!');
      throw error;
    }
    const orderWorker = OrderWorker.getInstance();
    console.log('✓ Order worker started');

    const wsWorker = WebSocketWorker.getInstance();
    console.log('✓ WebSocket worker started');

    const server = await buildServer();
    await server.listen({ port: PORT, host: HOST });
    console.log(`✓ Server listening on http://${HOST}:${PORT}`);

    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      
      await server.close();
      await orderWorker.close();
      await wsWorker.close();
      await redis.quit();
      console.log('✓ Server shut down complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

start();

