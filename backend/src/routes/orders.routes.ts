import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { orderRequestSchema } from '../validators/order.validator';
import { OrderService } from '../services/order.service';
import { OrderQueue } from '../queue/order.queue';
import { WebSocketManager } from '../utils/websocket.manager';

export async function registerOrderRoutes(fastify: FastifyInstance) {
  const orderService = new OrderService();
  const orderQueue = OrderQueue.getInstance();
  const wsManager = WebSocketManager.getInstance();

  /**
   * POST /api/orders/execute
   * Accept order, create it, and push to queue
   */
  fastify.post('/api/orders/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request
      const validatedData = orderRequestSchema.parse(request.body);
      
      // Create order with PENDING status
      const order = await orderService.createOrder(validatedData);
      
      // Add to queue for processing
      await orderQueue.addOrder(order.orderId);
      
      return reply.code(201).send({
        success: true,
        orderId: order.orderId,
        status: order.status,
        message: 'Order created and queued for execution',
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }
      
      console.error('Error creating order:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/orders
   * Get all orders
   */
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
      console.error('Error fetching orders:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/orders/:orderId
   * Get order status
   */
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
      console.error('Error fetching order:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    }
  });

  /**
   * WebSocket endpoint for real-time order updates
   * WS /api/orders/:orderId/stream
   */
  fastify.get('/api/orders/:orderId/stream', { websocket: true }, async (connection, req) => {
    const { orderId } = req.params as { orderId: string };
    
    console.log(`[WebSocket] New connection for orderId: ${orderId}`);
    
    // Register WebSocket connection
    wsManager.register(orderId, connection.socket);
    
    // Send initial connection confirmation
    connection.socket.send(JSON.stringify({
      type: 'connected',
      orderId,
      timestamp: new Date().toISOString(),
    }));

    // Send current order status immediately when WebSocket connects
    try {
      const order = await orderService.getOrder(orderId);
      if (order) {
        const initialUpdate = {
          orderId: order.orderId,
          status: order.status,
          dexType: order.dexType,
          executedPrice: order.executedPrice,
          txHash: order.txHash,
          errorReason: order.errorReason,
          timestamp: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : (typeof order.updatedAt === 'string' ? order.updatedAt : new Date().toISOString()),
        };
        connection.socket.send(JSON.stringify(initialUpdate));
        console.log(`[WebSocket] Sent initial status for orderId: ${orderId}, status: ${order.status}`);
      }
    } catch (error) {
      console.error(`[WebSocket] Error fetching initial order status for ${orderId}:`, error);
    }
    
    // Handle client messages (optional - for ping/pong)
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

