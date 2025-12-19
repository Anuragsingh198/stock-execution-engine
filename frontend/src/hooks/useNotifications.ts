import { useState, useCallback } from 'react';
import { Notification } from '../components/Notification';
import { OrderStatus } from '../types/order.types';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (
      type: 'success' | 'error' | 'info' | 'warning',
      title: string,
      message: string,
      options?: {
        status?: OrderStatus;
        txHash?: string;
        autoClose?: boolean;
        duration?: number;
      }
    ) => {
      const notification: Notification = {
        id: `${Date.now()}-${Math.random()}`,
        type,
        title,
        message,
        status: options?.status,
        txHash: options?.txHash,
        timestamp: new Date(),
        autoClose: options?.autoClose ?? true,
        duration: options?.duration ?? 5000,
      };

      setNotifications((prev) => [...prev, notification]);
      return notification.id;
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const showStatusNotification = useCallback(
    (status: OrderStatus, txHash?: string, errorReason?: string) => {
      switch (status) {
        case OrderStatus.PENDING:
          addNotification('info', 'Order Pending', 'Your order has been created and queued for execution', {
            status,
            autoClose: true,
            duration: 4000,
          });
          break;

        case OrderStatus.ROUTING:
          addNotification('info', 'Finding Best Route', 'Searching for the best DEX route for your order', {
            status,
            autoClose: true,
            duration: 4000,
          });
          break;

        case OrderStatus.BUILDING:
          addNotification('info', 'Building Transaction', 'Preparing your transaction for execution', {
            status,
            autoClose: true,
            duration: 4000,
          });
          break;

        case OrderStatus.SUBMITTED:
          addNotification('info', 'Transaction Submitted', 'Your transaction has been submitted to the blockchain', {
            status,
            txHash,
            autoClose: true,
            duration: 6000,
          });
          break;

        case OrderStatus.CONFIRMED:
          addNotification(
            'success',
            'Order Confirmed! 🎉',
            'Your order has been successfully executed and confirmed on the blockchain',
            {
              status,
              txHash,
              autoClose: true,
              duration: 8000,
            }
          );
          break;

        case OrderStatus.FAILED:
          addNotification(
            'error',
            'Order Failed',
            errorReason || 'Order execution failed. Please try again.',
            {
              status,
              autoClose: false, // Don't auto-close errors
              duration: 0,
            }
          );
          break;

        default:
          addNotification('info', 'Status Updated', `Order status changed to ${status}`, {
            status,
            autoClose: true,
            duration: 4000,
          });
      }
    },
    [addNotification]
  );

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    showStatusNotification,
  };
}
