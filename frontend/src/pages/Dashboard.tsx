import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { StockList } from '../components/StockList';
import { OrderCard } from '../components/OrderCard';
import { apiService } from '../services/api.service';
import { Order } from '../types/order.types';
import { getNetworkDisplayName } from '../utils/solana.utils';

export function Dashboard() {
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentOrders = async () => {
      try {
        const response = await apiService.getAllOrders(5, 0); // Get 5 most recent orders
        if (response.success) {
          setRecentOrders(response.orders);
        }
      } catch (err) {
        console.error('Error fetching recent orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentOrders();
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Stock Trading Platform</h1>
          <div className="network-badge" style={{ marginTop: '0.5rem' }}>
            🌐 Connected to {getNetworkDisplayName()}
          </div>
        </div>
        <Link to="/orders/create" className="create-order-button">
          Create New Order
        </Link>
      </div>

      <div className="dashboard-content">
        <section className="stocks-section">
          <StockList />
        </section>

        <section className="recent-orders-section">
          <h2>Recent Orders</h2>
          {loading ? (
            <div className="loading">Loading orders...</div>
          ) : recentOrders.length === 0 ? (
            <div className="no-orders">No orders yet. Create your first order!</div>
          ) : (
            <>
              <div className="orders-grid">
                {recentOrders.map((order) => (
                  <OrderCard key={order.orderId} order={order} />
                ))}
              </div>
              <Link to="/orders" className="view-all-link">
                View All Orders →
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

