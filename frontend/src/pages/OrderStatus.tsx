import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Order, OrderStatus as OrderStatusEnum, OrderUpdate } from '../types/order.types';
import { apiService } from '../services/api.service';
import { WebSocketService } from '../services/websocket.service';
import { SocketEventLog } from '../components/SocketEventLog';
import { SocketMessage } from '../types/order.types';

export function OrderStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketEvents, setSocketEvents] = useState<Array<SocketMessage | OrderUpdate>>([]);

  // Fetch order status
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const response = await apiService.getOrder(orderId);
      if (response.success && response.order) {
        setOrder(response.order);
      } else {
        setError(response.error || 'Order not found');
      }
    } catch (err: any) {
      setError(err.error || 'Failed to fetch order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;

    fetchOrder();

    // Set up WebSocket connection
    const ws = new WebSocketService(orderId);

    ws.on('connected', (data) => {
      setSocketEvents((prev) => [...prev, data as SocketMessage]);
    });

    ws.on('update', (update: OrderUpdate) => {
      setSocketEvents((prev) => [...prev, update]);
      // Update order state when status changes
      setOrder((prevOrder) => {
        if (!prevOrder) return prevOrder;
        return {
          ...prevOrder,
          status: update.status,
          dexType: update.dexType,
          executedPrice: update.executedPrice,
          txHash: update.txHash,
          errorReason: update.errorReason,
          updatedAt: update.timestamp,
        };
      });
    });

    ws.on('error', (data) => {
      console.error('WebSocket error:', data);
    });

    ws.on('closed', () => {
      console.log('WebSocket closed');
    });

    ws.connect().catch((err) => {
      console.error('Failed to connect WebSocket:', err);
    });

    // Poll for order updates every 5 seconds as fallback
    const pollInterval = setInterval(() => {
      fetchOrder();
    }, 5000);

    return () => {
      ws.disconnect();
      clearInterval(pollInterval);
    };
  }, [orderId, fetchOrder]);

  const getStatusColor = (status: OrderStatusEnum) => {
    switch (status) {
      case OrderStatusEnum.CONFIRMED:
        return '#10b981';
      case OrderStatusEnum.FAILED:
        return '#ef4444';
      case OrderStatusEnum.PENDING:
      case OrderStatusEnum.ROUTING:
      case OrderStatusEnum.BUILDING:
      case OrderStatusEnum.SUBMITTED:
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="order-status-page">
        <div className="loading">Loading order status...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="order-status-page">
        <div className="error-message">{error || 'Order not found'}</div>
        <Link to="/" className="back-link">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="order-status-page">
      <div className="order-status-header">
        <Link to="/orders" className="back-link">← Back to Orders</Link>
        <h1>Order Status</h1>
      </div>

      <div className="order-status-content">
        <div className="order-details">
          <div className="order-detail-card">
            <h2>Order Details</h2>
            <div className="detail-row">
              <span className="detail-label">Order ID:</span>
              <span className="detail-value">{order.orderId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span
                className="detail-value status-badge"
                style={{ backgroundColor: getStatusColor(order.status) }}
              >
                {order.status.toUpperCase()}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Token Pair:</span>
              <span className="detail-value">
                {order.amountIn} {order.tokenIn} → {order.tokenOut}
              </span>
            </div>
            {order.dexType && (
              <div className="detail-row">
                <span className="detail-label">DEX:</span>
                <span className="detail-value">{order.dexType.toUpperCase()}</span>
              </div>
            )}
            {order.executedPrice && (
              <div className="detail-row">
                <span className="detail-label">Executed Price:</span>
                <span className="detail-value">{order.executedPrice}</span>
              </div>
            )}
            {order.txHash && (
              <div className="detail-row">
                <span className="detail-label">Transaction Hash:</span>
                <span className="detail-value tx-hash">{order.txHash}</span>
              </div>
            )}
            {order.errorReason && (
              <div className="detail-row">
                <span className="detail-label">Error:</span>
                <span className="detail-value error-text">{order.errorReason}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Slippage Tolerance:</span>
              <span className="detail-value">{order.slippageTolerance}%</span>
            </div>
            {order.minAmountOut && (
              <div className="detail-row">
                <span className="detail-label">Min Amount Out:</span>
                <span className="detail-value">{order.minAmountOut}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Created At:</span>
              <span className="detail-value">{formatDate(order.createdAt)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Updated At:</span>
              <span className="detail-value">{formatDate(order.updatedAt)}</span>
            </div>
          </div>
        </div>

        <div className="socket-events-section">
          <SocketEventLog events={socketEvents} />
        </div>
      </div>
    </div>
  );
}

