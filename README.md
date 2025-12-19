# Order Execution Engine

A production-grade backend Order Execution Engine that processes MARKET orders with DEX routing and real-time WebSocket status updates.

🌐 **Live Demo**: [http://13.53.177.26/](http://13.53.177.26/)

## Demo Video

click to Watch the full application demo:
[![Demo Video](documets/dahsboard.png)](https://drive.google.com/file/d/1lPQuR74OeLIG2MJoCFNfZxGFBkVTwxS_/view)


**Direct Link**: [View on Google Drive](https://drive.google.com/file/d/1lPQuR74OeLIG2MJoCFNfZxGFBkVTwxS_/view?usp=drive_link)

The demo showcases:
- Order creation workflow
- Real-time order status updates via WebSocket
- Order history and filtering
- Dashboard with recent orders
- Complete order lifecycle from creation to confirmation

🌐 **Try it live**: [http://13.53.177.26/](http://13.53.177.26/)

## Application Screenshots

#### Dashboard View
![Dashboard](documets/dahsboard.png)

#### Orders List
![All Orders](documets/allordres.png)

#### Dashboard with Orders
![Dashboard Orders](documets/dashboardorders.png)

#### Order Creation Form
![Order Form](documets/orderform.png)

#### Order Response Examples
![Response 1](documets/reponseform1.png)
![Response 2](documets/response2.png)
![Response 4](documets/reponse4.png)
![Response 5](documets/reponse5.png)

## Table of Contents

- [Demo Video](#demo-video)
- [Application Screenshots](#application-screenshots)
- [Architecture](#architecture)
- [Design Decisions](#design-decisions)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Order Lifecycle](#order-lifecycle)
- [DEX Routing](#dex-routing)
- [Extending to Other Order Types](#extending-to-other-order-types)
- [AWS Deployment](#aws-deployment)

## Architecture

### High-Level Overview

The Order Execution Engine follows an **event-driven architecture** with status-specific queues for reliable WebSocket delivery:

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
│         Order Queue (BullMQ)                │
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
│  - Publishes events to status queues       │
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
       │ Publishes events
       │
┌──────▼─────────────────────────────────────┐
│      Event Publisher Service               │
│  ┌──────────────────────────────────────┐  │
│  │ Status-Specific Queues (BullMQ)      │  │
│  │  • pending   (Priority: 5)          │  │
│  │  • routing   (Priority: 6)          │  │
│  │  • building  (Priority: 7)          │  │
│  │  • submitted (Priority: 8)          │  │
│  │  • confirmed (Priority: 9)          │  │
│  │  • failed    (Priority: 10)         │  │
│  └──────────────────────────────────────┘  │
└──────┬─────────────────────────────────────┘
       │
       │ Workers subscribe
       │
┌──────▼─────────────────────────────────────┐
│      WebSocket Worker Service              │
│  ┌──────────────────────────────────────┐  │
│  │ 6 Workers (one per status queue)     │  │
│  │  • Parallel processing (50 default)   │  │
│  │  • Rate limit: 1000 events/min        │  │
│  │  • Automatic retries                  │  │
│  └──────────────────────────────────────┘  │
└──────┬─────────────────────────────────────┘
       │
       │ Emits to all connections
       │
┌──────▼─────────────────────────────────────┐
│      WebSocket Manager                     │
│  • Multiple connections per orderId        │
│  • Parallel emission                       │
│  • Connection management                   │
└──────┬─────────────────────────────────────┘
       │
       ├─────────────────────────────────────┐
       │                                     │
┌──────▼──────────┐              ┌──────────▼──────────┐
│  Order Model    │              │   Clients            │
│  (PostgreSQL)   │              │   (Real-time updates)│
└─────────────────┘              └─────────────────────┘
```

### Core Components

1. **HTTP API Layer** (`src/routes/`)
   - Handles incoming order requests
   - Validates input using Zod schemas
   - Manages WebSocket connections

2. **Order Queue System** (`src/queue/`, `src/workers/order.worker.ts`)
   - BullMQ for order execution queuing
   - Order worker processes orders with controlled concurrency
   - Rate limiting and retry logic for order execution

3. **Event-Driven System** (`src/services/event.publisher.ts`, `src/workers/websocket.worker.ts`)
   - **Event Publisher**: Publishes status updates to status-specific queues
   - **WebSocket Workers**: 6 workers (one per status) process events in parallel
   - Status-specific queues enable parallel processing and priority-based delivery
   - Events persisted in Redis (survive server restarts)

4. **Business Logic** (`src/services/`)
   - `OrderService`: Manages order lifecycle, publishes events (non-blocking)
   - `DexRouterService`: Queries multiple DEXs and selects best route
   - `EventPublisher`: Publishes order status updates to queues

5. **Data Layer** (`src/models/`, `src/config/`)
   - PostgreSQL for persistent order storage
   - Redis for queue management (order queue + 6 status queues)

6. **Real-time Updates** (`src/utils/websocket.manager.ts`)
   - WebSocket manager supports multiple connections per orderId
   - Parallel emission to all connections
   - Automatic cleanup of dead connections

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
│   │   ├── dex.router.service.ts # DEX routing logic
│   │   └── event.publisher.ts    # Event publisher (status-specific queues)
│   │
│   ├── queue/               # Queue configuration
│   │   └── order.queue.ts        # BullMQ queue setup for orders
│   │
│   ├── workers/             # Queue workers
│   │   ├── order.worker.ts       # Order processing worker
│   │   └── websocket.worker.ts   # WebSocket event delivery worker (6 workers)
│   │
│   ├── routes/              # API routes
│   │   └── orders.routes.ts      # HTTP & WebSocket endpoints
│   │
│   ├── utils/               # Utilities
│   │   ├── websocket.manager.ts  # WebSocket connection manager (multiple connections)
│   │   ├── date.util.ts          # Date utilities
│   │   ├── error.util.ts         # Error utilities
│   │   ├── quote.util.ts         # Quote calculation utilities
│   │   └── token.utils.ts         # Token utilities
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
- **Status Tracking**: Real-time updates via WebSocket (event-driven)
- **Error Handling**: Retry logic with exponential backoff

### 2. Event-Driven Architecture

- **Status-Specific Queues**: Separate BullMQ queue for each order status (pending, routing, building, submitted, confirmed, failed)
- **Event Publisher**: Non-blocking event publishing from order execution
- **WebSocket Workers**: 6 dedicated workers (one per status) process events in parallel
- **Priority-Based Processing**: Critical events (failed/confirmed) have higher priority
- **Event Persistence**: Events stored in Redis, survive server restarts
- **High Concurrency**: 50 parallel events per worker (configurable)

### 3. DEX Routing

- **Parallel Queries**: Raydium and Meteora quotes fetched simultaneously
- **Best Price Selection**: Chooses DEX with highest effective price (after fees)
- **Realistic Simulation**: Network latency (200ms), price variance (2-5%)
- **Fee Calculation**: Each DEX has realistic trading fees

### 4. Real-time Updates

- **WebSocket Connections**: Upgraded from same HTTP connection
- **Multiple Connections**: Supports multiple clients per orderId (multiple browser tabs)
- **Parallel Emission**: Events sent to all connections simultaneously
- **Lifecycle Events**: All status changes streamed to clients via event-driven system
- **Connection Management**: Automatic cleanup of dead connections

### 5. Production Features

- **Rate Limiting**: 100 orders per minute (order execution), 1000 events per minute per worker (WebSocket delivery)
- **Concurrency Control**: Max 10 concurrent order executions, 50 concurrent WebSocket events per worker
- **Retry Strategy**: 3 attempts with exponential backoff for both orders and events
- **Graceful Shutdown**: Clean resource cleanup on SIGTERM/SIGINT
- **Horizontal Scalability**: Can scale workers independently

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

Required environment variables:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/order_execution_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Order Queue Configuration
QUEUE_MAX_CONCURRENCY=10
QUEUE_RATE_LIMIT_PER_MINUTE=100

# WebSocket Worker Configuration
WS_WORKER_CONCURRENCY=50          # Parallel events per worker
WS_WORKER_RATE_LIMIT=1000         # Events per minute per worker
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
- Published to status-specific queue via Event Publisher (non-blocking)
- Processed by WebSocket workers in parallel
- Emitted via WebSocket to all connected clients (multiple connections supported)
- Logged to console

### Event-Driven Flow

1. **Order Service** updates status and publishes event to Event Publisher
2. **Event Publisher** adds event to appropriate status queue (Redis/BullMQ)
3. **WebSocket Worker** (one of 6 workers) picks up event from queue
4. **WebSocket Manager** emits event to all connections for that orderId in parallel
5. **Clients** receive real-time updates via WebSocket

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

- **Horizontal Scaling**: 
  - Multiple order worker instances
  - Multiple WebSocket worker instances (can scale per status queue)
  - Independent scaling of order execution vs WebSocket delivery
- **Database**: Connection pooling (already implemented)
- **Redis**: Cluster for high availability (handles order queue + 6 status queues)
- **Load Balancing**: Load balancer for HTTP/WebSocket connections
- **Event Processing**: High concurrency (50 events/worker) prevents bottlenecks

### Security

- Add authentication/authorization
- Rate limiting per user/IP
- Input sanitization (already using Zod)
- Secure WebSocket connections (WSS)

### Performance

- **Database**: Indexing (already implemented)
- **Redis**: Caching for frequently accessed orders, queue persistence
- **Connection Pooling**: Database and Redis (already implemented)
- **Async Processing**: Order execution and WebSocket delivery (already implemented)
- **Parallel Processing**: 
  - 6 WebSocket workers process events in parallel
  - 50 concurrent events per worker (configurable)
  - Multiple connections per order supported
- **Event-Driven**: Non-blocking event publishing, doesn't slow down order execution
- **Throughput**: 
  - Order execution: 100 orders/minute
  - WebSocket delivery: 6000 events/minute (6 workers × 1000 events/min)

## AWS Deployment

Deploy to AWS EC2 using Docker Compose - a simple and cost-effective method that runs both backend and frontend on a single EC2 instance.

### Quick Deployment

#### 1. Launch EC2 Instance
- Choose Ubuntu 22.04 LTS AMI
- Configure security group (ports 80, 22)
- Launch and download key pair

#### 2. Setup Docker on EC2

```bash
# Connect via SSH
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Docker
sudo apt update
sudo apt install docker.io docker-compose-plugin -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
# Log out and back in
```

#### 3. Clone and Configure

```bash
# Clone project
git clone url
cd stockproject

# Configure environment
cp .env.example .env
nano .env  # Add DATABASE_URL and REDIS_URL
```

#### 4. Deploy

```bash
# Build and start containers
docker-compose up -d --build

# Verify deployment
curl http://localhost:3000/health
docker-compose ps
```

Access your application at: `http://your-ec2-public-ip`

**Live Deployment**: [http://13.53.177.26/](http://13.53.177.26/)

### Common Commands

```bash
# Start/Stop
docker-compose up -d
docker-compose down
docker-compose restart

# Update
git pull && docker-compose up -d --build

# Logs
docker-compose logs -f
docker-compose logs -f backend
```

### Optional: Domain & SSL

- **Elastic IP**: Allocate and associate with instance
- **DNS**: Point domain A record to Elastic IP
- **SSL**: Use Let's Encrypt with Certbot for HTTPS



### Environment Variables

Required environment variables for production:

```env
# Backend
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/dbname
REDIS_URL=redis://host:6379
PORT=3000
HOST=0.0.0.0

# Queue Configuration
QUEUE_MAX_CONCURRENCY=10
QUEUE_RATE_LIMIT_PER_MINUTE=100

# WebSocket Worker Configuration
WS_WORKER_CONCURRENCY=50
WS_WORKER_RATE_LIMIT=1000

# Frontend
VITE_API_BASE_URL=https://your-backend-url
VITE_WS_BASE_URL=wss://your-backend-url
```

### Troubleshooting

#### Common Issues

1. **Connection Timeouts**: Ensure security groups allow traffic on required ports
2. **Database Connection**: Verify DATABASE_URL is correct and database is accessible
3. **Redis Connection**: Check REDIS_URL and network connectivity
4. **CORS Issues**: Ensure frontend URL is whitelisted in backend CORS settings
5. **WebSocket Issues**: Verify WebSocket upgrade is supported (App Runner supports this)

#### Health Checks

- Backend: `GET https://your-backend-url/health`
- Should return: `{"status":"ok","timestamp":"..."}`

### Cost Optimization

- Use App Runner's auto-scaling to minimize costs during low traffic
- Consider reserved capacity for predictable workloads
- Monitor CloudWatch metrics to optimize resource allocation
- Use managed database and Redis services for better cost efficiency

## License

ISC

