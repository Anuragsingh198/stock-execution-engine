# Postman Testing Guide - Order Execution Engine

## 🚀 Quick Start

**Base URL:** `http://localhost:3000`

---

## 📋 Available Endpoints

### 1. Health Check
**GET** `http://localhost:3000/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### 2. Create and Execute Order
**POST** `http://localhost:3000/api/orders/execute`

**Headers:**
```
Content-Type: application/json
```

**Request Body (JSON):**
```json
{
  "tokenIn": "So11111111111111111111111111111111111112",
  "tokenOut": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amountIn": "100.5",
  "slippageTolerance": 0.5,
  "minAmountOut": "95.0"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Order created and queued for execution"
}
```

**Error Response (400 - Validation Error):**
```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "path": ["amountIn"],
      "message": "amountIn must be a positive number"
    }
  ]
}
```

---

### 3. Get Order Status
**GET** `http://localhost:3000/api/orders/:orderId`

**Example:** `http://localhost:3000/api/orders/550e8400-e29b-41d4-a716-446655440000`

**Success Response (200):**
```json
{
  "success": true,
  "order": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "tokenIn": "So11111111111111111111111111111111111112",
    "tokenOut": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amountIn": "100.5",
    "slippageTolerance": 0.5,
    "minAmountOut": "95.0",
    "status": "confirmed",
    "dexType": "raydium",
    "executedPrice": "0.95",
    "txHash": "5j7s8K9L2mN3pQ4rT5vW6xY7zA8bC9dE0fG1hI2jK3lM4n",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:05.000Z"
  }
}
```

**Not Found Response (404):**
```json
{
  "success": false,
  "error": "Order not found"
}
```

---

### 4. WebSocket for Real-time Updates
**WS** `ws://localhost:3000/api/orders/:orderId/stream`

**Note:** Use a WebSocket client (not Postman's HTTP client) for this endpoint.

---

## 📝 Dummy Order Data Examples

### Example 1: Basic Order (SOL to USDC)
```json
{
  "tokenIn": "So11111111111111111111111111111111111112",
  "tokenOut": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amountIn": "1.5",
  "slippageTolerance": 1.0,
  "minAmountOut": "140.0"
}
```

### Example 2: Order without minAmountOut
```json
{
  "tokenIn": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "tokenOut": "So11111111111111111111111111111111111112",
  "amountIn": "200.0",
  "slippageTolerance": 0.5
}
```

### Example 3: High Slippage Tolerance
```json
{
  "tokenIn": "So11111111111111111111111111111111111112",
  "tokenOut": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amountIn": "10.0",
  "slippageTolerance": 5.0,
  "minAmountOut": "900.0"
}
```

---

## 🔄 Complete Execution Flow

### Step-by-Step: What Happens When You Hit POST /api/orders/execute

#### **Step 1: Request Received** (0ms)
- Fastify server receives POST request at `/api/orders/execute`
- Request body is parsed from JSON

#### **Step 2: Validation** (1-5ms)
- `orderRequestSchema.parse()` validates the request body using Zod
- Checks:
  - `tokenIn`: Must be a non-empty string
  - `tokenOut`: Must be a non-empty string
  - `amountIn`: Must be a positive number (as string)
  - `slippageTolerance`: Must be between 0 and 100
  - `minAmountOut`: Optional, but if provided must be non-negative

#### **Step 3: Create Order in Database** (5-50ms)
- `orderService.createOrder()` is called
- Order is inserted into PostgreSQL database with:
  - Generated UUID as `orderId`
  - Status: `PENDING`
  - All order details from request
  - `createdAt` and `updatedAt` timestamps

#### **Step 4: Add to Queue** (50-100ms)
- `orderQueue.addOrder(orderId)` is called
- Order ID is added to BullMQ queue named `'order-execution'`
- Job is created with:
  - Job name: `'execute-order'`
  - Job data: `{ orderId: "..." }`
  - Job ID: Same as orderId (prevents duplicates)

#### **Step 5: Return Response** (100-150ms)
- HTTP 201 response is sent back to Postman
- Response includes:
  - `success: true`
  - `orderId`: The generated UUID
  - `status: "pending"`
  - `message`: Confirmation message

---

### Background Processing (After Response is Sent)

#### **Step 6: Worker Picks Up Job** (100-500ms)
- `OrderWorker` (BullMQ Worker) picks up the job from Redis queue
- Worker is listening on queue `'order-execution'`
- Job is processed asynchronously

#### **Step 7: Order Execution** (500ms - 30s)
- `orderService.executeOrder(orderId)` is called
- This performs:
  1. **Status Update**: `PENDING` → `ROUTING`
  2. **DEX Routing**: Queries multiple DEXs (Raydium, Meteora) for best price
  3. **Slippage Check**: Validates price meets slippage tolerance
  4. **Status Update**: `ROUTING` → `BUILDING`
  5. **Transaction Building**: Builds the swap transaction
  6. **Status Update**: `BUILDING` → `SUBMITTED`
  7. **Transaction Submission**: Submits to blockchain
  8. **Status Update**: `SUBMITTED` → `CONFIRMED` (or `FAILED` if error)
  9. **Database Update**: Updates order with:
     - Final status
     - DEX used
     - Executed price
     - Transaction hash
     - Error reason (if failed)

#### **Step 8: WebSocket Updates** (Throughout execution)
- If WebSocket connection exists for this orderId:
  - Status updates are sent in real-time
  - Client receives updates at each status change:
    - `PENDING` → `ROUTING` → `BUILDING` → `SUBMITTED` → `CONFIRMED`

#### **Step 9: Completion**
- Order status is final: `CONFIRMED` or `FAILED`
- All data persisted in database
- WebSocket connection can be closed

---

## 🧪 Testing Steps in Postman

### Test 1: Health Check
1. Create new GET request
2. URL: `http://localhost:3000/health`
3. Click **Send**
4. **Expected**: `{ "status": "ok", "timestamp": "..." }`

### Test 2: Create Order
1. Create new POST request
2. URL: `http://localhost:3000/api/orders/execute`
3. Go to **Body** tab → Select **raw** → Select **JSON**
4. Paste one of the dummy order examples above
5. Click **Send**
6. **Expected**: 201 response with `orderId` and `status: "pending"`
7. **Copy the `orderId`** from response

### Test 3: Check Order Status
1. Create new GET request
2. URL: `http://localhost:3000/api/orders/{orderId}`
   - Replace `{orderId}` with the orderId from Test 2
3. Click **Send**
4. **Expected**: Order details with current status
5. **Repeat** this request multiple times to see status changes:
   - Initially: `"status": "pending"`
   - Then: `"status": "routing"`
   - Then: `"status": "building"`
   - Then: `"status": "submitted"`
   - Finally: `"status": "confirmed"` or `"status": "failed"`

### Test 4: Invalid Request (Validation Error)
1. Use the same POST request from Test 2
2. Change `amountIn` to `"-10"` (negative number)
3. Click **Send**
4. **Expected**: 400 response with validation error details

---

## 📊 Order Status Flow

```
PENDING → ROUTING → BUILDING → SUBMITTED → CONFIRMED
                                    ↓
                                 FAILED
```

- **PENDING**: Order created, waiting in queue
- **ROUTING**: Finding best DEX and price
- **BUILDING**: Building transaction
- **SUBMITTED**: Transaction sent to blockchain
- **CONFIRMED**: Transaction confirmed on blockchain
- **FAILED**: Error occurred at any stage

---

## 🔍 Monitoring Execution

### Check Server Logs
Watch your terminal/console for:
- `[Order Queue] Added order {orderId} to queue`
- `[Order Worker] Processing order {orderId}`
- `[Order Worker] Successfully processed order {orderId}`

### Check Database
Query your PostgreSQL database:
```sql
SELECT * FROM orders ORDER BY "createdAt" DESC LIMIT 10;
```

### Check Redis Queue
The order is stored in Redis queue `bull:order-execution:wait` until processed.

---

## ⚠️ Common Issues

### 1. Connection Refused
- **Problem**: Server not running
- **Solution**: Start server with `npm run dev` or `npm start`

### 2. Validation Error
- **Problem**: Request body doesn't match schema
- **Solution**: Check all required fields and data types

### 3. Order Stuck in PENDING
- **Problem**: Worker not processing jobs
- **Solution**: Check if OrderWorker is initialized (should see log: "Order worker initialized")

### 4. Order Fails Immediately
- **Problem**: DEX routing or transaction building fails
- **Solution**: Check `errorReason` field in order response

---

## 🎯 Quick Test Checklist

- [ ] Health check returns OK
- [ ] Can create order successfully
- [ ] Order status changes from PENDING to other statuses
- [ ] Can retrieve order by orderId
- [ ] Validation errors work correctly
- [ ] Server logs show queue and worker activity

---

## 📱 Postman Collection JSON

Save this as a Postman collection:

```json
{
  "info": {
    "name": "Order Execution Engine",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/health",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["health"]
        }
      }
    },
    {
      "name": "Create Order",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"tokenIn\": \"So11111111111111111111111111111111111112\",\n  \"tokenOut\": \"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\",\n  \"amountIn\": \"1.5\",\n  \"slippageTolerance\": 1.0,\n  \"minAmountOut\": \"140.0\"\n}"
        },
        "url": {
          "raw": "http://localhost:3000/api/orders/execute",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "orders", "execute"]
        }
      }
    },
    {
      "name": "Get Order Status",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/orders/:orderId",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "orders", ":orderId"],
          "variable": [
            {
              "key": "orderId",
              "value": "550e8400-e29b-41d4-a716-446655440000"
            }
          ]
        }
      }
    }
  ]
}
```

---

**Happy Testing! 🚀**
