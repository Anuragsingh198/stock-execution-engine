import { DUMMY_STOCKS } from '../config/api.config';

export function StockList() {
  return (
    <div className="stock-list">
      <h2>Available Stocks</h2>
      <div className="stock-grid">
        {DUMMY_STOCKS.map((stock) => (
          <div key={stock.symbol} className="stock-card">
            <div className="stock-header">
              <h3>{stock.symbol}</h3>
              <span className="stock-name">{stock.name}</span>
            </div>
            <div className="stock-price">${stock.price.toFixed(2)}</div>
            <div
              className={`stock-change ${stock.change >= 0 ? 'positive' : 'negative'}`}
            >
              {stock.change >= 0 ? '+' : ''}
              {stock.change.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

