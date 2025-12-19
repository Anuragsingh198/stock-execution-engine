import { API_CONFIG } from '../config/api.config';
import { SocketMessage, OrderUpdate } from '../types/order.types';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private orderId: string;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(orderId: string) {
    this.orderId = orderId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${API_CONFIG.WS_BASE_URL}/api/orders/${this.orderId}/stream`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.emit('connected', { orderId: this.orderId });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data: SocketMessage = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('[WebSocketService] Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', { error });
          reject(error);
        };

        this.ws.onclose = () => {
          this.emit('closed', {});
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: any) {
    if (data.type === 'connected') {
      this.emit('connected', data);
    } else if (data.type === 'pong') {
      this.emit('pong', data);
    } else if (data.status) {
      const update: OrderUpdate = {
        orderId: data.orderId || this.orderId,
        status: data.status,
        dexType: data.dexType,
        executedPrice: data.executedPrice,
        txHash: data.txHash,
        errorReason: data.errorReason,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      
      this.emit('update', update);
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(() => {
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (data: any) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  sendPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

