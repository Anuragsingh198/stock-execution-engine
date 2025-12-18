# Upstash Redis Setup Guide

## Getting Your Redis Connection URL

BullMQ requires a **native Redis connection URL** (not the REST API URL). Here's how to get it from Upstash:

### Steps:

1. **Log in to Upstash Dashboard**: https://console.upstash.com/
2. **Select your Redis database** (suited-dragon-24565)
3. **Go to "Details" or "Connect" tab**
4. **Look for "Redis URL"** - it should look like:
   ```
   rediss://default:PASSWORD@ep-lucky-mouse-XXXXX.upstash.io:XXXXX
   ```
5. **Copy the entire connection string**

### Update .env file:

Add the Redis URL to your `.env` file:

```env
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_HOST:PORT
```

**Important Notes:**
- Use `REDIS_URL` (not `UPSTASH_REDIS_REST_URL`)
- The connection string starts with `rediss://` (with SSL)
- The password is different from the REST token

### Alternative: If you only have REST credentials

If you only have the REST URL and token, you'll need to:

1. Check your Upstash dashboard for the Redis URL
2. Or create a new Redis database and copy the Redis URL
3. The REST API is separate and cannot be used with BullMQ

### Testing the Connection

Once you've added `REDIS_URL` to your `.env` file, restart the server:

```bash
npm run dev
```

You should see: `✓ Redis connected`

