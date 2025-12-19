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
      const order = await orderService.createOrder(validatedData);
      await orderQueue.addOrder(order.orderId);
      
      return reply.code(201).send({
        success: true,
        orderId: order.orderId,
        status: order.status,
        message: 'Order created and queued for execution',
      });
    } catch (error: any) {
      return handleRouteError(error, reply, 'Error creating order:');
    }
  });

  fastify.get('/api/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { limit?: string; offset?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 100;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const orders = await orderService.getAllOrders(limit, offset);

      return reply.send({
        success: true,
        orders,
        count: orders.length,
      });
    } catch (error: any) {
      return handleRouteError(error, reply, 'Error fetching orders:');
    }
  });

  fastify.get('/api/orders/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orderId } = request.params as { orderId: string };
      const order = await orderService.getOrder(orderId);
      
      if (!order) {
        return reply.code(404).send({
          success: false,
          error: 'Order not found',
        });
      }
      
      return reply.send({
        success: true,
        order,
      });
    } catch (error: any) {
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

