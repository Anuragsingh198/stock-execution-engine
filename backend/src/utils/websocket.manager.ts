import { SocketStream } from '@fastify/websocket';
import { OrderUpdate } from '../types/order.types';
import { normalizeDate } from './date.util';

/**
 * WebSocket Manager
 * 
 * Manages WebSocket connections with support for multiple connections per orderId.
 * Emits events to all connected clients in parallel for reliable delivery.
 */
export class WebSocketManager {
  private static instance: WebSocketManager;
  // Map: orderId -> Set of socket connections (supports multiple clients per order)
  private connections: Map<string, Set<SocketStream['socket']>> = new Map();
  // Map: socket -> orderId (for reverse lookup)
  private socketToOrderId: Map<SocketStream['socket'], string> = new Map();

  private constructor() {}

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Register a new WebSocket connection for an orderId
   * Supports multiple connections per orderId (e.g., multiple browser tabs)
   */
  public register(orderId: string, socket: SocketStream['socket']): void {
    if (!this.connections.has(orderId)) {
      this.connections.set(orderId, new Set());
    }

    const orderConnections = this.connections.get(orderId)!;
    orderConnections.add(socket);
    this.socketToOrderId.set(socket, orderId);

    socket.on('close', () => {
      this.unregisterSocket(socket);
    });

    socket.on('error', (error: Error) => {
      console.error(`WebSocket error for orderId ${orderId}:`, error);
      this.unregisterSocket(socket);
    });

    console.log(`[WebSocketManager] Registered connection for order ${orderId} (Total: ${orderConnections.size})`);
  }

  /**
   * Unregister a specific socket connection
   */
  private unregisterSocket(socket: SocketStream['socket']): void {
    const orderId = this.socketToOrderId.get(socket);
    if (!orderId) {
      return;
    }

    const orderConnections = this.connections.get(orderId);
    if (orderConnections) {
      orderConnections.delete(socket);
      if (orderConnections.size === 0) {
        this.connections.delete(orderId);
      }
    }

    this.socketToOrderId.delete(socket);
    console.log(`[WebSocketManager] Unregistered connection for order ${orderId}`);
  }

  /**
   * Unregister all connections for an orderId (legacy method for backward compatibility)
   */
  public unregister(orderId: string): void {
    const orderConnections = this.connections.get(orderId);
    if (orderConnections) {
      orderConnections.forEach((socket) => {
        socket.close();
        this.socketToOrderId.delete(socket);
      });
      this.connections.delete(orderId);
    }
  }

  /**
   * Emit an update to all WebSocket connections for a specific orderId
   * This is the main method used by the WebSocket worker for event-driven updates
   * 
   * @param orderId - The order ID to emit to
   * @param update - The order update to send
   * @returns Promise that resolves to the number of successful emissions
   */
  public async emitToOrder(orderId: string, update: OrderUpdate): Promise<number> {
    const orderConnections = this.connections.get(orderId);
    if (!orderConnections || orderConnections.size === 0) {
      // No connections - this is normal if client hasn't connected yet
      return 0;
    }

    const serializedUpdate = {
      ...update,
      timestamp: normalizeDate(update.timestamp).toISOString(),
    };
    const message = JSON.stringify(serializedUpdate);

    // Send to all connections in parallel
    const sendPromises = Array.from(orderConnections).map(async (socket) => {
      try {
        if (socket.readyState === 1) {
          // WebSocket.OPEN = 1
          socket.send(message);
          return true;
        } else {
          // Connection is not open, remove it
          this.unregisterSocket(socket);
          return false;
        }
      } catch (error) {
        console.error(`[WebSocketManager] Error sending to socket:`, error);
        this.unregisterSocket(socket);
        return false;
      }
    });

    const results = await Promise.all(sendPromises);
    const successCount = results.filter((r) => r === true).length;

    if (successCount > 0) {
      console.log(
        `[WebSocketManager] Emitted ${update.status} to ${successCount}/${orderConnections.size} connections for order ${orderId}`
      );
    }

    return successCount;
  }

  /**
   * Legacy emit method for backward compatibility
   * Now just calls emitToOrder
   */
  public async emit(orderId: string, update: OrderUpdate): Promise<boolean> {
    const count = await this.emitToOrder(orderId, update);
    return count > 0;
  }

  /**
   * Check if there are any connections for an orderId
   */
  public hasConnection(orderId: string): boolean {
    const connections = this.connections.get(orderId);
    return connections !== undefined && connections.size > 0;
  }

  /**
   * Get the number of unique orders with active connections
   */
  public getOrderCount(): number {
    return this.connections.size;
  }

  /**
   * Get the total number of active connections
   */
  public getConnectionCount(): number {
    let total = 0;
    this.connections.forEach((connections) => {
      total += connections.size;
    });
    return total;
  }

  /**
   * Get the number of connections for a specific orderId
   */
  public getConnectionCountForOrder(orderId: string): number {
    const connections = this.connections.get(orderId);
    return connections ? connections.size : 0;
  }

  /**
   * Clear all connections
   */
  public clearAll(): void {
    this.connections.forEach((connections) => {
      connections.forEach((socket) => socket.close());
    });
    this.connections.clear();
    this.socketToOrderId.clear();
  }
}

