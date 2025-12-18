# Stock Trading Frontend

React frontend for the Stock Trading Platform.

## Features

- 📊 Dashboard with stock list and recent orders
- 📈 Real-time order status updates via WebSocket
- 🔄 Order creation and management
- 📱 Responsive design
- 🎨 Modern UI with smooth animations

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## Configuration

The frontend is configured to connect to the backend at `http://localhost:3000` by default.

You can override this by creating a `.env` file:
```
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_BASE_URL=ws://localhost:3000
```

## Pages

- **Dashboard** (`/`) - Overview of stocks and recent orders
- **Orders List** (`/orders`) - View all orders with filtering
- **Create Order** (`/orders/create`) - Create a new trading order
- **Order Status** (`/orders/:orderId`) - View order details and real-time updates

## API Integration

The frontend uses:
- REST API for order creation and status checks
- WebSocket for real-time order updates
- Dummy data for stocks display (can be replaced with real API calls)

## Socket Events

All socket events are displayed in the Order Status page, including:
- Connection events
- Order status updates (pending → routing → building → submitted → confirmed/failed)
- Error events

