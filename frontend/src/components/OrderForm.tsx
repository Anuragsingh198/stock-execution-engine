import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderRequest } from '../types/order.types';
import { apiService } from '../services/api.service';
import { DUMMY_STOCKS } from '../config/api.config';

export function OrderForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<OrderRequest>({
    tokenIn: 'SOL',
    tokenOut: 'USDC',
    amountIn: '',
    slippageTolerance: 0.5,
    minAmountOut: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiService.createOrder(formData);
      if (response.success && response.orderId) {
        navigate(`/orders/${response.orderId}`);
      } else {
        setError(response.error || 'Failed to create order');
      }
    } catch (err: any) {
      setError(err.error || 'Failed to create order');
      if (err.details && err.details.length > 0) {
        setError(err.details.map((d: any) => d.message).join(', '));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="order-form">
      <h2>Create New Order</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="tokenIn">Token In</label>
          <select
            id="tokenIn"
            value={formData.tokenIn}
            onChange={(e) => setFormData({ ...formData, tokenIn: e.target.value })}
            required
          >
            {DUMMY_STOCKS.map((stock) => (
              <option key={stock.symbol} value={stock.symbol}>
                {stock.name} ({stock.symbol})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="tokenOut">Token Out</label>
          <select
            id="tokenOut"
            value={formData.tokenOut}
            onChange={(e) => setFormData({ ...formData, tokenOut: e.target.value })}
            required
          >
            {DUMMY_STOCKS.map((stock) => (
              <option key={stock.symbol} value={stock.symbol}>
                {stock.name} ({stock.symbol})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="amountIn">Amount In</label>
          <input
            type="number"
            id="amountIn"
            step="0.0001"
            value={formData.amountIn}
            onChange={(e) => setFormData({ ...formData, amountIn: e.target.value })}
            required
            min="0"
          />
        </div>

        <div className="form-group">
          <label htmlFor="slippageTolerance">Slippage Tolerance (%)</label>
          <input
            type="number"
            id="slippageTolerance"
            step="0.1"
            value={formData.slippageTolerance}
            onChange={(e) =>
              setFormData({ ...formData, slippageTolerance: parseFloat(e.target.value) })
            }
            required
            min="0"
            max="100"
          />
        </div>

        <div className="form-group">
          <label htmlFor="minAmountOut">Min Amount Out (Optional)</label>
          <input
            type="number"
            id="minAmountOut"
            step="0.0001"
            value={formData.minAmountOut}
            onChange={(e) => setFormData({ ...formData, minAmountOut: e.target.value })}
            min="0"
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" disabled={loading} className="submit-button">
          {loading ? 'Creating Order...' : 'Create Order'}
        </button>
      </form>
    </div>
  );
}

