import { OrderStatus } from '../types/order.types';

export function getStatusColor(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return '#10b981';
    case OrderStatus.FAILED:
      return '#ef4444';
    case OrderStatus.PENDING:
    case OrderStatus.ROUTING:
    case OrderStatus.BUILDING:
    case OrderStatus.SUBMITTED:
      return '#f59e0b';
    default:
      return '#6b7280';
  }
}

export function formatDate(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  return date.toLocaleString();
}

export function formatOrderId(orderId: string, length: number = 8): string {
  return orderId.slice(0, length);
}

export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}
