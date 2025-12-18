# Project Structure

## Complete File Tree

```
order-execution-engine/
│
├── src/                                    # Source code directory
│   │
│   ├── config/                            # Configuration & connection management
│   │   ├── database.config.ts             # PostgreSQL connection singleton
│   │   └── redis.config.ts                # Redis connection singleton
│   │
│   ├── models/                            # Database models (Data Access Layer)
│   │   └── order.model.ts                 # Order CRUD operations
│   │
│   ├── services/                          # Business logic layer
│   │   ├── order.service.ts               # Order lifecycle management
│   │   └── dex.router.service.ts          # DEX routing logic (Raydium & Meteora)
│   │
│   ├── queue/                             # Queue configuration
│   │   └── order.queue.ts                 # BullMQ queue setup
│   │
│   ├── workers/                           # Queue workers
│   │   └── order.worker.ts                # Order processing worker
│   │
│   ├── routes/                            # API routes (Controller layer)
│   │   └── orders.routes.ts               # HTTP & WebSocket endpoints
│   │
│   ├── utils/                             # Utility classes
│   │   └── websocket.manager.ts           # WebSocket connection manager
│   │
│   ├── types/                             # TypeScript type definitions
│   │   └── order.types.ts                 # Order interfaces, enums, types
│   │
│   ├── validators/                        # Input validation
│   │   └── order.validator.ts             # Zod validation schemas
│   │
│   ├── __tests__/                         # Test files
│   │   │
│   │   ├── services/                      # Service layer tests
│   │   │   ├── dex.router.service.test.ts      # DEX routing tests
│   │   │   ├── order.service.test.ts           # Order service tests
│   │   │   └── slippage.protection.test.ts     # Slippage protection tests
│   │   │
│   │   ├── models/                        # Model layer tests
│   │   │   └── order.model.test.ts             # Database operation tests
│   │   │
│   │   ├── utils/                         # Utility tests
│   │   │   └── websocket.manager.test.ts       # WebSocket manager tests
│   │   │
│   │   ├── queue/                         # Queue tests
│   │   │   └── order.queue.test.ts             # Queue configuration tests
│   │   │
│   │   ├── workers/                       # Worker tests
│   │   │   └── order.worker.test.ts            # Worker logic tests
│   │   │
│   │   ├── routes/                        # Route tests
│   │   │   └── orders.routes.test.ts           # API endpoint tests
│   │   │
│   │   ├── validators/                    # Validator tests
│   │   │   └── order.validator.test.ts         # Input validation tests
│   │   │
│   │   └── integration/                   # Integration tests
│   │       ├── order.lifecycle.test.ts         # Full order lifecycle tests
│   │       └── websocket.lifecycle.test.ts     # WebSocket event flow tests
│   │
│   └── server.ts                          # Application entry point
│
├── package.json                           # Node.js dependencies & scripts
├── tsconfig.json                          # TypeScript configuration
├── jest.config.js                         # Jest test configuration
├── .gitignore                             # Git ignore rules
├── .env.example                           # Environment variables template
│
└── Documentation/
    ├── README.md                          # Main documentation
    ├── ARCHITECTURE.md                    # Architecture & design details
    ├── STRUCTURE.md                       # This file (project structure)
    └── SETUP.md                           # Setup & installation guide
```

## Directory Explanations

### `/src/config/`
**Purpose**: Centralized configuration and connection management

- **database.config.ts**: 
  - PostgreSQL connection pool management
  - Singleton pattern ensures single connection pool
  - Handles connection errors and cleanup
  
- **redis.config.ts**: 
  - Redis client and subscriber instances
  - Singleton pattern for connection reuse
  - Error handling and retry strategy

### `/src/models/`
**Purpose**: Data Access Layer - abstracts database operations

- **order.model.ts**: 
  - CRUD operations for orders table
  - Handles table initialization
  - Maps database rows to TypeScript objects
  - No business logic, only data operations

### `/src/services/`
**Purpose**: Business logic layer - core application functionality

- **order.service.ts**: 
  - Order lifecycle management
  - Status transitions
  - Slippage protection logic
  - Transaction hash generation
  - Coordinates between models, router, and WebSocket manager

- **dex.router.service.ts**: 
  - Queries multiple DEXs (Raydium, Meteora) in parallel
  - Calculates effective prices (after fees)
  - Selects best route
  - Mock implementation with realistic latency and variance

### `/src/queue/`
**Purpose**: Job queue configuration

- **order.queue.ts**: 
  - BullMQ queue instance setup
  - Queue configuration (retries, rate limits)
  - Job addition logic
  - Singleton pattern

### `/src/workers/`
**Purpose**: Async job processing

- **order.worker.ts**: 
  - BullMQ worker configuration
  - Processes queued orders
  - Concurrency and rate limiting
  - Error handling and retry logic
  - Event handlers for job lifecycle

### `/src/routes/`
**Purpose**: HTTP/WebSocket API endpoints (Controller layer)

- **orders.routes.ts**: 
  - POST /api/orders/execute - Create and queue order
  - GET /api/orders/:orderId - Get order status
  - WS /api/orders/:orderId/stream - WebSocket stream for real-time updates
  - Input validation
  - Error handling and HTTP responses

### `/src/utils/`
**Purpose**: Shared utility classes

- **websocket.manager.ts**: 
  - Manages WebSocket connections (orderId → socket mapping)
  - Registers/unregisters connections
  - Emits status updates
  - Handles connection cleanup

### `/src/types/`
**Purpose**: TypeScript type definitions

- **order.types.ts**: 
  - OrderStatus enum
  - DexType enum
  - OrderRequest interface
  - Order interface
  - DexQuote interface
  - OrderUpdate interface

### `/src/validators/`
**Purpose**: Input validation schemas

- **order.validator.ts**: 
  - Zod schemas for request validation
  - Type-safe validation
  - Error messages

### `/src/__tests__/`
**Purpose**: Test files organized by layer

- **services/**: Unit tests for business logic
- **models/**: Tests for database operations
- **utils/**: Tests for utility classes
- **queue/**: Tests for queue configuration
- **workers/**: Tests for worker logic
- **routes/**: Tests for API endpoints
- **validators/**: Tests for validation schemas
- **integration/**: End-to-end tests

### Root Files

- **server.ts**: 
  - Application entry point
  - Initializes database, Redis, worker
  - Sets up Fastify server
  - Graceful shutdown handling

- **package.json**: 
  - Dependencies and dev dependencies
  - Scripts (build, start, test, dev)

- **tsconfig.json**: 
  - TypeScript compiler configuration
  - Strict type checking
  - Source maps for debugging

- **jest.config.js**: 
  - Jest test runner configuration
  - Test file patterns
  - Coverage settings

## Design Principles Applied

### 1. Separation of Concerns
- **Routes**: Handle HTTP/WebSocket only
- **Services**: Business logic
- **Models**: Data access
- **Config**: Infrastructure setup

### 2. DRY (Don't Repeat Yourself)
- Shared database connection
- Centralized status update logic
- Reusable validation schemas
- Common error handling patterns

### 3. SOLID Principles
- **Single Responsibility**: Each class has one clear purpose
- **Open/Closed**: Easy to extend (new DEXs, order types)
- **Dependency Inversion**: Services depend on abstractions (interfaces)

### 4. OOP (Object-Oriented Programming)
- Classes for services, models, managers
- Encapsulation (private methods, public APIs)
- Inheritance-ready structure
- Polymorphism via interfaces

### 5. Production-Ready Structure
- Error handling at all layers
- Logging for debugging
- Graceful shutdown
- Connection pooling
- Rate limiting
- Retry strategies

## File Count Summary

- **Configuration**: 2 files
- **Models**: 1 file
- **Services**: 2 files
- **Queue/Workers**: 2 files
- **Routes**: 1 file
- **Utils**: 1 file
- **Types**: 1 file
- **Validators**: 1 file
- **Tests**: 11 files
- **Root**: 1 file (server.ts)

**Total**: 23 source files + 11 test files = 34 files

## Dependencies Overview

### Runtime Dependencies
- `fastify`: Web framework
- `@fastify/websocket`: WebSocket support
- `bullmq`: Job queue system
- `ioredis`: Redis client
- `pg`: PostgreSQL client
- `uuid`: UUID generation
- `zod`: Schema validation
- `dotenv`: Environment variables

### Dev Dependencies
- `typescript`: TypeScript compiler
- `tsx`: TypeScript execution (dev)
- `jest`: Test framework
- `ts-jest`: Jest TypeScript support
- `@types/*`: TypeScript type definitions

