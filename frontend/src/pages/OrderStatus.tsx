import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Order, OrderStatus as OrderStatusEnum, OrderUpdate } from '../types/order.types';
import { apiService } from '../services/api.service';
import { WebSocketService } from '../services/websocket.service';
import { SocketEventLog } from '../components/SocketEventLog';
import { SocketMessage } from '../types/order.types';
import { formatTxHash, getSolanaExplorerUrl, copyToClipboard, getNetworkDisplayName } from '../utils/solana.utils';
import { getStatusColor, formatDate } from '../utils/order.utils';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationContainer } from '../components/Notification';

export function OrderStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketEvents, setSocketEvents] = useState<Array<SocketMessage | OrderUpdate>>([]);
  const { notifications, showStatusNotification, removeNotification } = useNotifications();

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

    const ws = new WebSocketService(orderId);

    ws.on('connected', (data) => {
      setSocketEvents((prev) => [...prev, data as SocketMessage]);
    });

    ws.on('update', (update: OrderUpdate) => {
      // Show notification for status update
      showStatusNotification(update.status, update.txHash, update.errorReason);

      setSocketEvents((prev) => {
        if (update.status === OrderStatusEnum.FAILED) {
          const filtered = prev.filter(
            (event) => !('status' in event && event.status === OrderStatusEnum.FAILED)
          );
          return [...filtered, update];
        }
        
        const isDuplicate = prev.some(
          (event) => 
            'status' in event && 
            event.status === update.status && 
            'orderId' in event && 
            event.orderId === update.orderId &&
            'timestamp' in event &&
            event.timestamp === update.timestamp
        );
        if (isDuplicate) {
          return prev;
        }
        return [...prev, update];
      });
      setOrder((prevOrder) => {
        if (!prevOrder) {
          return {
            orderId: update.orderId,
            tokenIn: '',
            tokenOut: '',
            amountIn: '',
            slippageTolerance: 0,
            status: update.status,
            dexType: update.dexType,
            executedPrice: update.executedPrice,
            txHash: update.txHash,
            errorReason: update.errorReason,
            createdAt: update.timestamp,
            updatedAt: update.timestamp,
          } as Order;
        }
        
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
    });

    ws.connect().catch((err) => {
      console.error('Failed to connect WebSocket:', err);
    });

    const pollInterval = setInterval(() => {
      fetchOrder();
    }, 5000);

    return () => {
      ws.disconnect();
      clearInterval(pollInterval);
    };
  }, [orderId, fetchOrder]);

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
      <NotificationContainer
        notifications={notifications}
        onClose={removeNotification}
      />
      
      <div className="order-status-header">
        <Link to="/orders" className="back-link">← Back to Orders</Link>
        <div className="header-right">
          <h1>Order Status</h1>
          <div className="network-badge">
            🌐 {getNetworkDisplayName()}
          </div>
        </div>
      </div>

      {order.status === OrderStatusEnum.FAILED && order.errorReason && (
        <div className="failed-order-banner">
          <div className="failed-banner-content">
            <span className="failed-icon">❌</span>
            <div className="failed-banner-text">
              <strong>Order Failed</strong>
              <p>{order.errorReason}</p>
            </div>
          </div>
        </div>
      )}

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
                <div className="detail-value tx-hash-container">
                  <span className="tx-hash">{formatTxHash(order.txHash, 12)}</span>
                  <div className="tx-hash-actions">
                    <button
                      className="tx-action-button"
                      onClick={() => copyToClipboard(order.txHash!)}
                      title="Copy transaction hash"
                    >
                      📋 Copy
                    </button>
                    <a
                      href={getSolanaExplorerUrl(order.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-action-button"
                      title="View on Solana Explorer"
                    >
                      🔗 View on Explorer
                    </a>
                  </div>
                </div>
              </div>
            )}
            {order.errorReason && (
              <div className="detail-row error-row">
                <span className="detail-label">Error Reason:</span>
                <div className="detail-value error-container">
                  <div className="error-display">
                    <span className="error-icon-large">⚠️</span>
                    <span className="error-text">{order.errorReason}</span>
                  </div>
                  {order.status === OrderStatusEnum.FAILED && (
                    <div className="error-actions">
                      <button
                        className="retry-button"
                        onClick={() => window.location.reload()}
                        title="Refresh to check if issue is resolved"
                      >
                        🔄 Refresh
                      </button>
                    </div>
                  )}
                </div>
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

