# Architecture Documentation

## Key Functions & Responsibilities

### Database Layer

#### `Database.getInstance()`
- **Responsibility**: Singleton instance for PostgreSQL connection pool
- **Input**: None (configuration from environment variables)
- **Output**: Database instance with connection pool
- **Key Methods**:
  - `query(text, params)`: Execute SQL queries with parameter binding
  - `close()`: Gracefully close connection pool

#### `OrderModel.create(order: Order)`
- **Responsibility**: Persist new order to PostgreSQL
- **Input**: Order object with all required fields
- **Output**: Promise<void>
- **Side Effects**: Inserts row into `orders` table

#### `OrderModel.updateStatus(orderId, status, updates?)`
- **Responsibility**: Update order status and optional fields
- **Input**: 
  - `orderId`: string
  - `status`: OrderStatus enum
  - `updates`: Partial<Order> (optional fields like txHash, executedPrice)
- **Output**: Promise<void>
- **Side Effects**: Updates `orders` table row

#### `OrderModel.findById(orderId)`
- **Responsibility**: Retrieve order by ID
- **Input**: `orderId`: string
- **Output**: Promise<Order | null>

---

### Service Layer

#### `OrderService.createOrder(orderRequest: OrderRequest)`
- **Responsibility**: Create new order with PENDING status
- **Input**: Validated OrderRequest
- **Output**: Promise<Order>
- **Side Effects**: 
  - Generates UUID for orderId
  - Persists to database
  - Logs creation

#### `OrderService.executeOrder(orderId: string)`
- **Responsibility**: Execute full order lifecycle
- **Input**: `orderId`: string
- **Output**: Promise<void>
- **Flow**:
  1. Update to ROUTING
  2. Query DEX router for best price
  3. Update to BUILDING with selected DEX
  4. Update to SUBMITTED
  5. Simulate execution (2-3 seconds)
  6. Apply slippage protection
  7. Update to CONFIRMED with final price & txHash
- **Error Handling**: Catches errors, updates to FAILED status
- **Side Effects**: 
  - Updates database at each stage
  - Emits WebSocket events

#### `OrderService.updateOrderStatus(orderId, status, additionalData?)` (private)
- **Responsibility**: Centralized status update + WebSocket emission
- **Input**: orderId, status, optional additional fields
- **Output**: Promise<void>
- **Side Effects**: 
  - Updates database
  - Emits WebSocket message

#### `DexRouterService.findBestRoute(orderRequest: OrderRequest)`
- **Responsibility**: Query all DEXs and return best quote
- **Input**: OrderRequest
- **Output**: Promise<DexQuote>
- **Flow**:
  1. Query Raydium and Meteora in parallel
  2. Calculate effective price (after fees) for each
  3. Return quote with highest effective price
- **Mock Implementation**:
  - Simulates 200ms latency
  - Applies 2-5% price variance
  - Calculates realistic fees (Raydium: 0.25%, Meteora: 0.3%)

---

### Queue & Worker Layer

#### `OrderQueue.getInstance()`
- **Responsibility**: Singleton BullMQ queue instance
- **Input**: None (Redis connection from RedisClient)
- **Output**: OrderQueue instance
- **Configuration**:
  - Max concurrency: 10 (configurable via env)
  - Rate limit: 100 orders/min (configurable via env)
  - Retry: 3 attempts with exponential backoff

#### `OrderQueue.addOrder(orderId: string)`
- **Responsibility**: Add order to processing queue
- **Input**: `orderId`: string
- **Output**: Promise<void>
- **Side Effects**: Creates BullMQ job with orderId as jobId (prevents duplicates)

#### `OrderWorker.processJob(job)` (private, called by BullMQ)
- **Responsibility**: Process queued order
- **Input**: BullMQ job object with `{ orderId }` in data
- **Output**: Promise<void>
- **Flow**: Calls `OrderService.executeOrder(orderId)`
- **Error Handling**: Throws error to trigger BullMQ retry logic

---

### WebSocket Layer

#### `WebSocketManager.getInstance()`
- **Responsibility**: Singleton manager for WebSocket connections
- **Input**: None
- **Output**: WebSocketManager instance
- **Data Structure**: Map<orderId, WebSocket>

#### `WebSocketManager.register(orderId, socket)`
- **Responsibility**: Register new WebSocket connection for orderId
- **Input**: 
  - `orderId`: string
  - `socket`: WebSocket instance
- **Output**: void
- **Side Effects**: 
  - Adds to connections map
  - Sets up close/error handlers

#### `WebSocketManager.emit(orderId, update)`
- **Responsibility**: Send status update to connected client
- **Input**: 
  - `orderId`: string
  - `update`: OrderUpdate object
- **Output**: Promise<boolean> (true if sent, false if no connection)
- **Side Effects**: Sends JSON message to WebSocket

#### `WebSocketManager.unregister(orderId)`
- **Responsibility**: Remove WebSocket connection
- **Input**: `orderId`: string
- **Output**: void
- **Side Effects**: Closes socket, removes from map

---

### API Layer

#### `POST /api/orders/execute`
- **Responsibility**: Accept order request, create order, queue for processing
- **Input**: HTTP request body (OrderRequest JSON)
- **Output**: HTTP 201 with orderId and status
- **Flow**:
  1. Validate request with Zod schema
  2. Create order via OrderService
  3. Add to queue via OrderQueue
  4. Return orderId to client
- **Error Responses**: 
  - 400: Validation error
  - 500: Internal server error

#### `GET /api/orders/:orderId`
- **Responsibility**: Retrieve order details
- **Input**: orderId in URL path
- **Output**: HTTP 200 with order object, or 404 if not found

#### `WS /api/orders/:orderId/stream`
- **Responsibility**: Real-time order status updates via WebSocket
- **Input**: WebSocket connection with orderId in path
- **Output**: Continuous JSON messages with status updates
- **Messages**: OrderUpdate objects at each lifecycle stage

---

## Data Flow

### Order Creation Flow

```
Client → POST /api/orders/execute
  ↓
Routes: Validate input (Zod)
  ↓
OrderService.createOrder()
  ↓
OrderModel.create() → PostgreSQL
  ↓
OrderQueue.addOrder() → BullMQ
  ↓
Return orderId to client
```

### Order Execution Flow

```
BullMQ Worker receives job
  ↓
OrderService.executeOrder(orderId)
  ↓
1. Update status: ROUTING → emit WebSocket
  ↓
2. DexRouterService.findBestRoute()
   ├─ Query Raydium (parallel)
   └─ Query Meteora (parallel)
   └─ Select best quote
  ↓
3. Update status: BUILDING (with DEX) → emit WebSocket
  ↓
4. Update status: SUBMITTED → emit WebSocket
  ↓
5. Simulate execution (2-3s delay)
  ↓
6. Apply slippage protection
  ↓
7. Update status: CONFIRMED (with price & txHash) → emit WebSocket
  ↓
Persist final state to PostgreSQL
```

### WebSocket Update Flow

```
OrderService.updateOrderStatus()
  ↓
1. OrderModel.updateStatus() → PostgreSQL
  ↓
2. WebSocketManager.emit(orderId, update)
  ↓
3. Find socket in connections map
  ↓
4. Send JSON message to client
```

---

## Design Patterns Used

1. **Singleton Pattern**: Database, Redis, WebSocketManager, OrderQueue, OrderWorker
   - Ensures single instance, prevents resource leaks
   
2. **Repository Pattern**: OrderModel abstracts database operations
   
3. **Service Pattern**: OrderService, DexRouterService encapsulate business logic
   
4. **Worker Pattern**: OrderWorker processes async jobs from queue
   
5. **Observer Pattern**: WebSocket emits events to subscribed clients

---

## Error Handling Strategy

### Validation Errors
- **Where**: API route layer (Zod validation)
- **Response**: HTTP 400 with error details
- **Action**: Request not processed

### Database Errors
- **Where**: Model layer
- **Response**: Logged, propagated to service layer
- **Action**: Order marked as FAILED

### Execution Errors
- **Where**: OrderService.executeOrder()
- **Response**: Order status → FAILED, errorReason stored
- **Action**: BullMQ retries (3 attempts with exponential backoff)

### WebSocket Errors
- **Where**: WebSocketManager
- **Response**: Connection closed, unregistered
- **Action**: Client must reconnect if needed

---

## Concurrency & Rate Limiting

### Queue Configuration
- **Max Concurrency**: 10 orders processed simultaneously
- **Rate Limit**: 100 orders per minute
- **Configuration**: Environment variables (QUEUE_MAX_CONCURRENCY, QUEUE_RATE_LIMIT_PER_MINUTE)

### Database Connection Pooling
- **Max Connections**: 20 (configurable in Database config)
- **Idle Timeout**: 30 seconds
- **Connection Timeout**: 2 seconds

### Redis Connection
- **Strategy**: Retry with exponential backoff
- **Max Retries**: 3 per request

---

## Extension Points

### Adding New DEX

1. Add to `DexType` enum in `order.types.ts`
2. Add query method in `DexRouterService`:
```typescript
private async queryNewDex(orderRequest: OrderRequest): Promise<DexQuote> {
  // Implement quote logic
}
```
3. Add to `findBestRoute()` parallel queries

### Adding Order Status

1. Add to `OrderStatus` enum
2. Update `OrderService.executeOrder()` to handle new status
3. WebSocket emission happens automatically via `updateOrderStatus()`

### Adding Order Type (Limit, Sniper)

1. Extend `OrderRequest` interface or create new
2. Add execution method in `OrderService`:
```typescript
public async executeLimitOrder(orderId: string): Promise<void> {
  // Implement limit order logic
}
```
3. Update route to handle different order types
4. Reuse existing queue, worker, WebSocket infrastructure

---

## Performance Considerations

### Database
- Indexed columns: `status`, `created_at`
- Connection pooling prevents connection exhaustion
- Parameterized queries prevent SQL injection

### Queue System
- BullMQ handles job persistence (survives restarts)
- Rate limiting prevents system overload
- Concurrency control prevents resource exhaustion

### WebSocket
- Map-based lookup O(1) for connection retrieval
- Automatic cleanup prevents memory leaks
- Single manager instance prevents connection duplication

### Async Processing
- Non-blocking queue processing
- Parallel DEX queries (Promise.all)
- Status updates don't block execution

