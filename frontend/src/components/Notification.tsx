import { useEffect } from 'react';
import { OrderStatus } from '../types/order.types';
import './Notification.css';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  status?: OrderStatus;
  txHash?: string;
  timestamp: Date;
  autoClose?: boolean;
  duration?: number;
}

interface NotificationProps {
  notification: Notification;
  onClose: (id: string) => void;
}

export function NotificationItem({ notification, onClose }: NotificationProps) {
  useEffect(() => {
    if (notification.autoClose !== false) {
      const timer = setTimeout(() => {
        onClose(notification.id);
      }, notification.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [notification.id, notification.autoClose, notification.duration, onClose]);

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  };

  const getStatusMessage = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return 'Order is pending and queued for execution';
      case OrderStatus.ROUTING:
        return 'Finding the best DEX route for your order';
      case OrderStatus.BUILDING:
        return 'Building transaction for execution';
      case OrderStatus.SUBMITTED:
        return 'Transaction submitted to blockchain';
      case OrderStatus.CONFIRMED:
        return 'Order confirmed and executed successfully!';
      case OrderStatus.FAILED:
        return 'Order execution failed';
      default:
        return 'Order status updated';
    }
  };

  return (
    <div className={`notification notification-${notification.type}`}>
      <div className="notification-content">
        <div className="notification-icon">{getIcon()}</div>
        <div className="notification-text">
          <div className="notification-title">{notification.title}</div>
          <div className="notification-message">
            {notification.message}
            {notification.status && (
              <span className="notification-status">
                {' '}
                {getStatusMessage(notification.status)}
              </span>
            )}
          </div>
          {notification.txHash && (
            <div className="notification-tx">
              <a
                href={`https://explorer.solana.com/tx/${notification.txHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="notification-tx-link"
              >
                View Transaction →
              </a>
            </div>
          )}
        </div>
        <button
          className="notification-close"
          onClick={() => onClose(notification.id)}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}

interface NotificationContainerProps {
  notifications: Notification[];
  onClose: (id: string) => void;
}

export function NotificationContainer({
  notifications,
  onClose,
}: NotificationContainerProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={onClose}
        />
      ))}
    </div>
  );
}
