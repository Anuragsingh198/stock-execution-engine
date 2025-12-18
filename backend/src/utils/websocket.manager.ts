import { SocketStream } from '@fastify/websocket';
import { OrderUpdate } from '../types/order.types';

export class WebSocketManager {
  private static instance: WebSocketManager;
  private connections: Map<string, SocketStream['socket']> = new Map();

  private constructor() {}

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  public register(orderId: string, socket: SocketStream['socket']): void {
    this.connections.set(orderId, socket);
    console.log(`WebSocket registered for orderId: ${orderId}`);

    socket.on('close', () => {
      this.unregister(orderId);
    });

    socket.on('error', (error: Error) => {
      console.error(`WebSocket error for orderId ${orderId}:`, error);
      this.unregister(orderId);
    });
  }

  public unregister(orderId: string): void {
    const socket = this.connections.get(orderId);
    if (socket) {
      socket.close();
      this.connections.delete(orderId);
      console.log(`WebSocket unregistered for orderId: ${orderId}`);
    }
  }

  public async emit(orderId: string, update: OrderUpdate): Promise<boolean> {
    const socket = this.connections.get(orderId);
    if (!socket) {
      console.warn(`No WebSocket connection found for orderId: ${orderId}`);
      return false;
    }

    try {
      // Ensure timestamp is a string for JSON serialization
      const serializedUpdate = {
        ...update,
        timestamp: update.timestamp instanceof Date ? update.timestamp.toISOString() : update.timestamp,
      };
      const message = JSON.stringify(serializedUpdate);
      socket.send(message);
      console.log(`WebSocket update sent for orderId: ${orderId}, status: ${update.status}`);
      return true;
    } catch (error) {
      console.error(`Error sending WebSocket message for orderId ${orderId}:`, error);
      this.unregister(orderId);
      return false;
    }
  }

  public hasConnection(orderId: string): boolean {
    return this.connections.has(orderId);
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public clearAll(): void {
    this.connections.forEach((socket) => socket.close());
    this.connections.clear();
  }
}

