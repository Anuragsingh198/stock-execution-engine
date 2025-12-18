# Order Execution Engine

A production-grade backend Order Execution Engine that processes MARKET orders with DEX routing and real-time WebSocket status updates.

## Table of Contents

- [Architecture](#architecture)
- [Design Decisions](#design-decisions)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Order Lifecycle](#order-lifecycle)
- [DEX Routing](#dex-routing)
- [Testing](#testing)
- [Extending to Other Order Types](#extending-to-other-order-types)

## Architecture

### High-Level Overview

The Order Execution Engine follows a **microservices-inspired architecture** with clear separation of concerns:

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ HTTP POST /api/orders/execute
       │
┌──────▼─────────────────────────────────────┐
│         Fastify HTTP Server                │
│  - Validates order request                 │
│  - Creates order (PENDING)                 │
│  - Adds to BullMQ queue                    │
└──────┬─────────────────────────────────────┘
       │
       │ Queue Job
       │
┌──────▼─────────────────────────────────────┐
│         BullMQ Queue                       │
│  - Max Concurrency: 10                     │
│  - Rate Limit: 100 orders/min              │
│  - Retry: 3 attempts (exponential backoff) │
└──────┬─────────────────────────────────────┘
       │
       │ Worker processes
       │
┌──────▼─────────────────────────────────────┐
│         Order Worker                       │
│  - Fetches order from queue                │
│  - Executes order lifecycle                │
│  - Emits WebSocket updates                 │
└──────┬─────────────────────────────────────┘
       │
       ├─────────────────────────────────────┐
       │                                     │
┌──────▼──────────┐              ┌──────────▼──────────┐
│  Order Service  │              │   DEX Router        │
│  - Lifecycle    │              │   - Raydium         │
│  - Status mgmt  │              │   - Meteora         │
└──────┬──────────┘              └─────────────────────┘
       │
       ├─────────────────────────────────────┐
       │                                     │
┌──────▼──────────┐              ┌──────────▼──────────┐
│  Order Model    │              │ WebSocket Manager   │
│  (PostgreSQL)   │              │ (Real-time updates) │
└─────────────────┘              └─────────────────────┘
```

### Core Components

1. **HTTP API Layer** (`src/routes/`)
   - Handles incoming order requests
   - Validates input using Zod schemas
   - Manages WebSocket connections

2. **Queue System** (`src/queue/`, `src/workers/`)
   - BullMQ for job queuing and processing
   - Worker processes orders with controlled concurrency
   - Rate limiting and retry logic

3. **Business Logic** (`src/services/`)
   - `OrderService`: Manages order lifecycle
   - `DexRouterService`: Queries multiple DEXs and selects best route

4. **Data Layer** (`src/models/`, `src/config/`)
   - PostgreSQL for persistent order storage
   - Redis for queue management and WebSocket mapping

5. **Real-time Updates** (`src/utils/`)
   - WebSocket manager maps orderId → WebSocket connections
   - Emits status updates at each lifecycle stage

## Design Decisions

### Why Market Orders Only?

**Market Orders** are the simplest order type that execute immediately at the current market price. This design choice:

1. **Simplifies Initial Implementation**: No need to track pending limit orders, price matching, or order books
2. **Focuses on Core Architecture**: Emphasizes routing, execution pipeline, and real-time updates
3. **Easier to Extend**: Once the foundation is solid, adding Limit and Sniper orders becomes straightforward
4. **Production-Ready Foundation**: The same architecture handles all order types; only the execution logic differs

### Separation of Concerns

- **Controller Layer**: Routes handle HTTP/WebSocket communication only
- **Service Layer**: Business logic isolated from infrastructure
- **Model Layer**: Database operations abstracted
- **Queue/Worker**: Async processing separated from API layer

### Singleton Pattern

Key services (Database, Redis, WebSocketManager, OrderQueue, OrderWorker) use singleton pattern to:
- Ensure single connection pool instances
- Prevent resource leaks
- Centralize configuration

### DRY Principle

- Common database operations abstracted in `Database` class
- Status update logic centralized in `updateOrderStatus`
- Reusable validation schemas
- Shared connection management

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Web Framework**: Fastify (with WebSocket support)
- **Queue System**: BullMQ + Redis
- **Database**: PostgreSQL (order history)
- **Caching/Queue**: Redis (active orders, WebSocket mapping)
- **Validation**: Zod
- **Testing**: Jest

## Project Structure

```
order-execution-engine/
├── src/
│   ├── config/              # Configuration & connection management
│   │   ├── database.config.ts    # PostgreSQL connection (singleton)
│   │   └── redis.config.ts       # Redis connection (singleton)
│   │
│   ├── models/              # Database models
│   │   └── order.model.ts        # Order CRUD operations
│   │
│   ├── services/            # Business logic
│   │   ├── order.service.ts      # Order lifecycle management
│   │   └── dex.router.service.ts # DEX routing logic
│   │
│   ├── queue/               # Queue configuration
│   │   └── order.queue.ts        # BullMQ queue setup
│   │
│   ├── workers/             # Queue workers
│   │   └── order.worker.ts       # Order processing worker
│   │
│   ├── routes/              # API routes
│   │   └── orders.routes.ts      # HTTP & WebSocket endpoints
│   │
│   ├── utils/               # Utilities
│   │   └── websocket.manager.ts  # WebSocket connection manager
│   │
│   ├── types/               # TypeScript types
│   │   └── order.types.ts        # Order interfaces & enums
│   │
│   ├── validators/          # Input validation
│   │   └── order.validator.ts    # Zod schemas
│   │
│   ├── __tests__/           # Tests
│   │   ├── services/
│   │   ├── models/
│   │   ├── utils/
│   │   ├── queue/
│   │   ├── routes/
│   │   ├── workers/
│   │   └── integration/
│   │
│   └── server.ts            # Application entry point
│
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Key Features

### 1. Order Execution Pipeline

- **Input Validation**: Zod schemas ensure data integrity
- **Async Processing**: Orders queued immediately, processed asynchronously
- **Status Tracking**: Real-time updates via WebSocket
- **Error Handling**: Retry logic with exponential backoff

### 2. DEX Routing

- **Parallel Queries**: Raydium and Meteora quotes fetched simultaneously
- **Best Price Selection**: Chooses DEX with highest effective price (after fees)
- **Realistic Simulation**: Network latency (200ms), price variance (2-5%)
- **Fee Calculation**: Each DEX has realistic trading fees

### 3. Real-time Updates

- **WebSocket Connections**: Upgraded from same HTTP connection
- **Lifecycle Events**: All status changes streamed to client
- **Connection Management**: Automatic cleanup on disconnect

### 4. Production Features

- **Rate Limiting**: 100 orders per minute
- **Concurrency Control**: Max 10 concurrent order executions
- **Retry Strategy**: 3 attempts with exponential backoff
- **Graceful Shutdown**: Clean resource cleanup on SIGTERM/SIGINT

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+

### Installation

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your database and Redis credentials
```

3. **Set up PostgreSQL database**:
```sql
CREATE DATABASE order_execution_db;
```

4. **Start Redis** (if not running):
```bash
redis-server
```

5. **Build and run**:
```bash
npm run build
npm start
```

For development with hot reload:
```bash
npm run dev
```

## API Documentation

### POST /api/orders/execute

Creates a new market order and queues it for execution.

**Request Body**:
```json
{
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": "100",
  "slippageTolerance": 0.5,
  "minAmountOut": "99" // optional
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "orderId": "uuid-here",
  "status": "pending",
  "message": "Order created and queued for execution"
}
```

### GET /api/orders/:orderId

Retrieves order status and details.

**Response** (200 OK):
```json
{
  "success": true,
  "order": {
    "orderId": "uuid-here",
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amountIn": "100",
    "status": "confirmed",
    "dexType": "raydium",
    "executedPrice": "1.49500000",
    "txHash": "0x...",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:10Z"
  }
}
```

### WebSocket: /api/orders/:orderId/stream

Real-time order status updates.

**Connection**: Upgrade HTTP connection to WebSocket

**Messages Received**:
```json
{
  "orderId": "uuid-here",
  "status": "routing",
  "timestamp": "2024-01-01T00:00:01Z"
}
```

**Lifecycle Statuses** (in order):
1. `pending` - Order created, queued
2. `routing` - Querying DEXs for best price
3. `building` - Building transaction
4. `submitted` - Transaction submitted to blockchain
5. `confirmed` - Transaction confirmed (includes `txHash`, `executedPrice`)
6. `failed` - Execution failed (includes `errorReason`)

## Order Lifecycle

Each order progresses through the following stages:

1. **PENDING**: Order created, validated, persisted to DB
2. **ROUTING**: DEX router queries Raydium and Meteora in parallel
3. **BUILDING**: Transaction constructed for selected DEX
4. **SUBMITTED**: Transaction submitted (mocked execution, 2-3 seconds)
5. **CONFIRMED**: Execution successful, final price calculated with slippage protection
6. **FAILED**: Error occurred, reason stored

All status changes are:
- Persisted to PostgreSQL
- Emitted via WebSocket to connected clients
- Logged to console

## DEX Routing

### How It Works

1. **Parallel Queries**: Both Raydium and Meteora are queried simultaneously
2. **Quote Calculation**:
   - Base price calculated from token pair hash (consistent per pair)
   - Price variance applied (2-5% random)
   - Trading fees deducted (Raydium: 0.25%, Meteora: 0.3%)
3. **Selection**: DEX with highest effective price (after fees) is chosen
4. **Logging**: Routing decision logged for debugging

### Mock Implementation Details

- **Latency**: 200ms base + random 0-50ms
- **Price Variance**: 2-5% difference between DEXs
- **Fees**: Realistic trading fees per DEX
- **Deterministic**: Same token pair produces consistent base price

## Testing

Run all tests:
```bash
npm test
```

Run with coverage:
```bash
npm run test:coverage
```

### Test Coverage

The test suite includes:

1. **DEX Router Tests**: Quote calculation, best route selection
2. **Order Service Tests**: Order creation, lifecycle management
3. **WebSocket Manager Tests**: Connection management, message emission
4. **Queue Tests**: Job addition, retry logic
5. **Validation Tests**: Input validation edge cases
6. **Model Tests**: Database operations
7. **Integration Tests**: Full order lifecycle, WebSocket events
8. **Route Tests**: HTTP endpoint behavior

## Extending to Other Order Types

### Limit Orders

To add limit orders, extend the architecture:

1. **New Order Type**:
```typescript
// src/types/order.types.ts
export enum OrderType {
  MARKET = 'market',
  LIMIT = 'limit',
}

export interface LimitOrderRequest extends OrderRequest {
  limitPrice: string; // Price at which to execute
}
```

2. **Order Service Extension**:
```typescript
// src/services/order.service.ts
public async executeLimitOrder(orderId: string): Promise<void> {
  // Check current market price
  // If price matches limit, execute
  // Otherwise, store in pending orders table
}
```

3. **Price Monitor Service**:
```typescript
// src/services/price.monitor.service.ts
// Polls DEX prices and triggers limit order execution when matched
```

### Sniper Orders

Sniper orders execute when a specific condition is met:

1. **Condition Definition**:
```typescript
export interface SniperOrderRequest extends OrderRequest {
  triggerCondition: 'price_above' | 'price_below' | 'volume_spike';
  triggerValue: string;
}
```

2. **Event-Driven Execution**:
```typescript
// src/services/sniper.service.ts
// Listens to price/volume events
// Executes when condition met
```

3. **Integration**:
- Add to same queue system
- Use WebSocket for real-time trigger notifications
- Store conditions in PostgreSQL

### Key Principles for Extension

- **Reuse Core Infrastructure**: Queue, worker, WebSocket manager stay the same
- **Extend Service Layer**: Add new execution methods, reuse routing logic
- **Shared Models**: Same database schema with additional fields
- **Unified API**: Same endpoints, different request schemas

## Production Considerations

### Monitoring

- Add logging/monitoring (Winston, DataDog, etc.)
- Track queue depth, processing times
- Monitor WebSocket connection counts
- Alert on high failure rates

### Scaling

- Horizontal scaling: Multiple worker instances
- Database connection pooling (already implemented)
- Redis cluster for high availability
- Load balancer for HTTP/WebSocket connections

### Security

- Add authentication/authorization
- Rate limiting per user/IP
- Input sanitization (already using Zod)
- Secure WebSocket connections (WSS)

### Performance

- Database indexing (already implemented)
- Redis caching for frequently accessed orders
- Connection pooling (already implemented)
- Async processing (already implemented)

## License

ISC

