import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { CreateOrder } from './pages/CreateOrder';
import { OrderStatus } from './pages/OrderStatus';
import { OrdersList } from './pages/OrdersList';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <div className="nav-container">
            <Link to="/" className="nav-logo">
              Stock Trading
            </Link>
            <div className="nav-links">
              <Link to="/" className="nav-link">
                Dashboard
              </Link>
              <Link to="/orders" className="nav-link">
                Orders
              </Link>
              <Link to="/orders/create" className="nav-link">
                Create Order
              </Link>
            </div>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<OrdersList />} />
            <Route path="/orders/create" element={<CreateOrder />} />
            <Route path="/orders/:orderId" element={<OrderStatus />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

