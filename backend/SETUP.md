# Quick Setup Guide

## Prerequisites

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **PostgreSQL** (v12 or higher)
   ```bash
   psql --version
   ```

3. **Redis** (v6 or higher)
   ```bash
   redis-cli --version
   ```

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

Create a PostgreSQL database:

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database
CREATE DATABASE order_execution_db;

-- (Optional) Create a dedicated user
CREATE USER order_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE order_execution_db TO order_user;
```

The application will automatically create the `orders` table on first run.

### 3. Redis Setup

Start Redis server:

```bash
# On Linux/Mac
redis-server

# On Windows (if installed as service, it may already be running)
# Or download Redis for Windows from: https://github.com/microsoftarchive/redis/releases
```

Verify Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

### 4. Environment Configuration

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=order_execution_db
DB_USER=postgres
DB_PASSWORD=your_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Queue Configuration
QUEUE_MAX_CONCURRENCY=10
QUEUE_RATE_LIMIT_PER_MINUTE=100
```

### 5. Build and Run

Build TypeScript:
```bash
npm run build
```

Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### 6. Verify Installation

Check server health:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

## Testing

Run all tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

## Troubleshooting

### Database Connection Error

**Error**: `Connection refused` or `password authentication failed`

**Solutions**:
1. Verify PostgreSQL is running: `pg_isready`
2. Check credentials in `.env`
3. Verify database exists: `psql -U postgres -l`
4. Check PostgreSQL is listening on correct port: `netstat -an | grep 5432`

### Redis Connection Error

**Error**: `Connection to Redis failed`

**Solutions**:
1. Verify Redis is running: `redis-cli ping`
2. Check Redis host/port in `.env`
3. If using password, ensure `REDIS_PASSWORD` is set correctly

### Port Already in Use

**Error**: `EADDRINUSE: address already in use`

**Solutions**:
1. Change `PORT` in `.env` to a different port
2. Or kill the process using port 3000:
   ```bash
   # Find process
   lsof -i :3000
   # Kill process (replace PID with actual process ID)
   kill -9 PID
   ```

### Module Not Found Errors

**Error**: `Cannot find module 'xxx'`

**Solutions**:
1. Delete `node_modules` and `package-lock.json`
2. Run `npm install` again
3. Ensure you're using Node.js v18+

## Development Tips

### Hot Reload

Use `npm run dev` for automatic reload on file changes (uses `tsx watch`).

### Logging

The application logs to console. In production, consider:
- Using Winston or Pino for structured logging
- Logging to files or external services
- Adding log levels and filtering

### Database Migrations

Currently, the table is created automatically. For production:
- Consider using a migration tool (e.g., `node-pg-migrate`)
- Version control your schema changes
- Run migrations as part of deployment

### Monitoring

Add monitoring for:
- Queue depth (BullMQ metrics)
- Database connection pool status
- WebSocket connection count
- Order execution success/failure rates

## Production Deployment

### Environment Variables

Ensure all sensitive values are set:
- Use secrets management (AWS Secrets Manager, HashiCorp Vault, etc.)
- Never commit `.env` file to version control
- Use environment-specific configurations

### Process Management

Use a process manager:
- **PM2**: `pm2 start dist/server.js`
- **systemd**: Create a service file
- **Docker**: Use Dockerfile with health checks

### Scaling

1. **Horizontal Scaling**: Run multiple worker instances
2. **Load Balancer**: Place behind load balancer for HTTP/WebSocket
3. **Database**: Use read replicas for read-heavy workloads
4. **Redis**: Use Redis Cluster for high availability

### Health Checks

The `/health` endpoint can be used for:
- Kubernetes liveness/readiness probes
- Load balancer health checks
- Monitoring system checks

## Next Steps

1. Review [README.md](./README.md) for API documentation
2. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for design details
3. Run tests to verify everything works
4. Try creating an order via API
5. Connect via WebSocket to see real-time updates

