import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Order } from '../types/order.types';
import { OrderCard } from '../components/OrderCard';
import { apiService } from '../services/api.service';

export function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiService.getAllOrders(100, 0);
        if (response.success) {
          setOrders(response.orders);
        } else {
          setError('Failed to load orders');
        }
      } catch (err: any) {
        setError(err.error || 'Failed to load orders');
        console.error('Error fetching orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const filteredOrders =
    filter === 'all'
      ? orders
      : orders.filter((order) => order.status === filter);

  return (
    <div className="orders-list-page">
      <div className="orders-list-header">
        <h1>All Orders</h1>
        <Link to="/orders/create" className="create-order-button">
          Create New Order
        </Link>
      </div>

      <div className="orders-filters">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          Pending
        </button>
        <button
          className={filter === 'confirmed' ? 'active' : ''}
          onClick={() => setFilter('confirmed')}
        >
          Confirmed
        </button>
        <button
          className={filter === 'failed' ? 'active' : ''}
          onClick={() => setFilter('failed')}
        >
          Failed
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading orders...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <div className="orders-grid">
          {filteredOrders.length === 0 ? (
            <div className="no-orders">No orders found</div>
          ) : (
            filteredOrders.map((order) => <OrderCard key={order.orderId} order={order} />)
          )}
        </div>
      )}
    </div>
  );
}

