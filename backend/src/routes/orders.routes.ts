import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { orderRequestSchema } from '../validators/order.validator';
import { OrderService } from '../services/order.service';
import { OrderQueue } from '../queue/order.queue';
import { WebSocketManager } from '../utils/websocket.manager';
import { OrderUpdate } from '../types/order.types';
import { handleRouteError } from '../utils/error.util';
import { normalizeDate } from '../utils/date.util';

export async function registerOrderRoutes(fastify: FastifyInstance) {
  const orderService = new OrderService();
  const orderQueue = OrderQueue.getInstance();
  const wsManager = WebSocketManager.getInstance();

  fastify.post('/api/orders/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = orderRequestSchema.parse(request.body);
      console.log('[POST /api/orders/execute] Creating order with data:', validatedData);
      const order = await orderService.createOrder(validatedData);
      console.log(`[POST /api/orders/execute] Order created: ${order.orderId}`);
      await orderQueue.addOrder(order.orderId);
      console.log(`[POST /api/orders/execute] Order queued: ${order.orderId}`);
      
      // Fetch the order from database to ensure it's committed and return full object
      // In Docker, database operations may have network latency, so we retry with increasing delays
      let savedOrder = await orderService.getOrder(order.orderId);
      if (!savedOrder) {
        console.log(`[POST /api/orders/execute] Order not immediately available, retrying: ${order.orderId}`);
        // Retry with exponential backoff for Docker/network latency
        const retries = [200, 500, 1000]; // Increasing delays
        for (const delay of retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          savedOrder = await orderService.getOrder(order.orderId);
          if (savedOrder) {
            console.log(`[POST /api/orders/execute] Order found after ${delay}ms delay: ${order.orderId}`);
            break;
          }
        }
        
        if (!savedOrder) {
          console.error(`[POST /api/orders/execute] Order still not found after all retries: ${order.orderId}`);
          // Still return success with orderId - frontend can fetch it
          return reply.code(201).send({
            success: true,
            orderId: order.orderId,
            status: order.status,
            message: 'Order created and queued for execution. Please refresh to view details.',
          });
        }
      }
      
      console.log(`[POST /api/orders/execute] Order successfully created and retrieved: ${order.orderId}`);
      return reply.code(201).send({
        success: true,
        order: savedOrder,
        orderId: savedOrder.orderId,
        status: savedOrder.status,
        message: 'Order created and queued for execution',
      });
    } catch (error: any) {
      console.error('[POST /api/orders/execute] Error creating order:', error);
      return handleRouteError(error, reply, 'Error creating order:');
    }
  });

  // IMPORTANT: Register /api/orders BEFORE /api/orders/:orderId
  // Fastify matches routes in registration order, so specific routes must come after general ones
  // Handle both /api/orders and /api/orders/ (with trailing slash)
  fastify.get('/api/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { limit?: string; offset?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 100;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      console.log(`[GET /api/orders] Fetching orders with limit=${limit}, offset=${offset}`);
      const orders = await orderService.getAllOrders(limit, offset);
      console.log(`[GET /api/orders] Found ${orders.length} orders`);

      return reply.send({
        success: true,
        orders,
        count: orders.length,
      });
    } catch (error: any) {
      console.error('[GET /api/orders] Error:', error);
      return handleRouteError(error, reply, 'Error fetching orders:');
    }
  });

  // Handle /api/orders/ (with trailing slash) - redirect to /api/orders or handle the same way
  fastify.get('/api/orders/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { limit?: string; offset?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 100;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      console.log(`[GET /api/orders/] Fetching orders with limit=${limit}, offset=${offset}`);
      const orders = await orderService.getAllOrders(limit, offset);
      console.log(`[GET /api/orders/] Found ${orders.length} orders`);

      return reply.send({
        success: true,
        orders,
        count: orders.length,
      });
    } catch (error: any) {
      console.error('[GET /api/orders/] Error:', error);
      return handleRouteError(error, reply, 'Error fetching orders:');
    }
  });

  // This route must come AFTER /api/orders to avoid route conflicts
  fastify.get('/api/orders/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orderId } = request.params as { orderId: string };
      
      // Safety check: if orderId looks invalid or empty, this might be a misrouted request
      if (!orderId || orderId.trim() === '' || orderId === 'orders' || orderId.includes('limit') || orderId.includes('offset')) {
        console.error(`[GET /api/orders/:orderId] Suspicious orderId parameter: "${orderId}". This might be a route conflict.`);
        console.error(`[GET /api/orders/:orderId] Request URL: ${request.url}`);
        console.error(`[GET /api/orders/:orderId] Request path: ${request.routerPath}`);
        // Don't return 404 here - let it fall through or return a proper error
        return reply.code(400).send({
          success: false,
          error: 'Invalid order ID format',
        });
      }
      
      console.log(`[GET /api/orders/:orderId] Fetching order: ${orderId}`);
      const order = await orderService.getOrder(orderId);
      
      if (!order) {
        console.log(`[GET /api/orders/:orderId] Order not found: ${orderId}`);
        return reply.code(404).send({
          success: false,
          error: 'Order not found',
        });
      }
      
      console.log(`[GET /api/orders/:orderId] Order found: ${orderId}, status: ${order.status}`);
      return reply.send({
        success: true,
        order,
      });
    } catch (error: any) {
      console.error(`[GET /api/orders/:orderId] Error fetching order:`, error);
      return handleRouteError(error, reply, 'Error fetching order:');
    }
  });

  fastify.get('/api/orders/:orderId/stream', { websocket: true }, async (connection, req) => {
    const { orderId } = req.params as { orderId: string };
    
    connection.socket.send(JSON.stringify({
      type: 'connected',
      orderId,
      timestamp: new Date().toISOString(),
    }));

    wsManager.register(orderId, connection.socket);
    
    setTimeout(async () => {
      try {
        const order = await orderService.getOrder(orderId);
        if (order) {
          const timestamp = normalizeDate(order.updatedAt);
          
          const initialUpdate: OrderUpdate = {
            orderId: order.orderId,
            status: order.status,
            dexType: order.dexType,
            executedPrice: order.executedPrice,
            txHash: order.txHash,
            errorReason: order.errorReason,
            timestamp: timestamp,
          };
          
          await wsManager.emit(orderId, initialUpdate);
        }
      } catch (error) {
        console.error(`[WebSocket] Error fetching initial order status for ${orderId}:`, error);
      }
    }, 300);
    
    connection.socket.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          connection.socket.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString(),
          }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
  });
}

