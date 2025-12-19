import { Link } from 'react-router-dom';
import { Order, OrderStatus } from '../types/order.types';
import { formatTxHash, getSolanaExplorerUrl } from '../utils/solana.utils';
import { getStatusColor, formatDate, formatOrderId, truncateText } from '../utils/order.utils';

interface OrderCardProps {
  order: Order;
}

export function OrderCard({ order }: OrderCardProps) {

  const handleTxHashClick = (e: React.MouseEvent, txHash: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(getSolanaExplorerUrl(txHash), '_blank');
  };

  return (
    <Link to={`/orders/${order.orderId}`} className="order-card">
      <div className="order-card-header">
        <span className="order-id">Order #{formatOrderId(order.orderId)}</span>
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
        {order.txHash && (
          <div 
            className="order-tx-hash"
            onClick={(e) => handleTxHashClick(e, order.txHash!)}
            title="View on Solana Explorer"
          >
            TX: {formatTxHash(order.txHash)}
            <span className="external-link-icon">↗</span>
          </div>
        )}
        {order.status === OrderStatus.FAILED && order.errorReason && (
          <div className="order-error">
            <span className="error-icon">⚠️</span>
            <span className="error-message-text" title={order.errorReason}>
              {truncateText(order.errorReason)}
            </span>
          </div>
        )}
        <div className="order-date">{formatDate(order.updatedAt)}</div>
      </div>
    </Link>
  );
}

