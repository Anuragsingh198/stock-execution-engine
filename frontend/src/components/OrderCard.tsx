import { Link } from 'react-router-dom';
import { Order, OrderStatus } from '../types/order.types';

interface OrderCardProps {
  order: Order;
}

export function OrderCard({ order }: OrderCardProps) {
  const getStatusColor = (status: OrderStatus) => {
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
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Link to={`/orders/${order.orderId}`} className="order-card">
      <div className="order-card-header">
        <span className="order-id">Order #{order.orderId.slice(0, 8)}</span>
        <span
          className="order-status"
          style={{ backgroundColor: getStatusColor(order.status) }}
        >
          {order.status.toUpperCase()}
        </span>
      </div>
      <div className="order-card-body">
        <div className="order-pair">
          <span className="token-in">{order.amountIn} {order.tokenIn}</span>
          <span className="arrow">→</span>
          <span className="token-out">{order.tokenOut}</span>
        </div>
        {order.dexType && (
          <div className="order-dex">DEX: {order.dexType.toUpperCase()}</div>
        )}
        {order.executedPrice && (
          <div className="order-price">Price: {order.executedPrice}</div>
        )}
        <div className="order-date">{formatDate(order.updatedAt)}</div>
      </div>
    </Link>
  );
}

