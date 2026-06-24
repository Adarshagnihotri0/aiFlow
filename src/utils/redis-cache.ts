import Redis from 'ioredis';

let redis: Redis | null = null;

// Buffer for batching Redis writes
const writeBuffer: Map<string, { chunks: string[]; lastFlush: number }> = new Map();
const FLUSH_INTERVAL = 2000; // Flush every 2 seconds
const MAX_BUFFER_SIZE = 100; // Or flush after 100 chunks

/**
 * Get Redis client instance (singleton)
 */
export function getRedisClient(): Redis | null {
  if (!redis && process.env.REDIS_URL) {
    try {
      redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });

      redis.on('error', (err) => {
        console.error('Redis connection error:', err);
      });

      redis.on('connect', () => {
        console.log('✓ Redis connected');
      });
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      return null;
    }
  }
  return redis;
}

/**
 * Flush buffer to Redis
 */
async function flushBuffer(requestId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  const buffer = writeBuffer.get(requestId);
  if (!buffer || buffer.chunks.length === 0) return;

  const prefix = process.env.REDIS_STREAM_PREFIX || 'mcp:stream:';
  const key = `${prefix}${requestId}`;

  try {
    // Batch write all chunks
    if (buffer.chunks.length > 0) {
      await client.rpush(key, ...buffer.chunks);
      
      // Set TTL on first write
      if (buffer.chunks.length === buffer.chunks.length) {
        const ttl = parseInt(process.env.REDIS_CACHE_TTL || '3600', 10);
        await client.expire(key, ttl);
      }
    }

    // Clear buffer after successful flush
    buffer.chunks = [];
    buffer.lastFlush = Date.now();
  } catch (error) {
    console.error('Failed to flush buffer:', error);
  }
}

/**
 * Store streaming response in Redis cache (buffered)
 */
export async function cacheStreamResponse(
  requestId: string,
  chunk: string,
  isFinal: boolean = false
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  // Initialize buffer if needed
  if (!writeBuffer.has(requestId)) {
    writeBuffer.set(requestId, { chunks: [], lastFlush: Date.now() });
  }

  const buffer = writeBuffer.get(requestId)!;
  buffer.chunks.push(chunk);

  // Flush conditions:
  // 1. Buffer size exceeded
  // 2. Time since last flush exceeded
  // 3. Final chunk
  const shouldFlush = 
    buffer.chunks.length >= MAX_BUFFER_SIZE ||
    Date.now() - buffer.lastFlush >= FLUSH_INTERVAL ||
    isFinal;

  if (shouldFlush) {
    await flushBuffer(requestId);
  }
}

/**
 * Get all cached chunks for a request
 */
export async function getCachedStream(requestId: string): Promise<string[]> {
  const client = getRedisClient();
  if (!client) return [];

  const prefix = process.env.REDIS_STREAM_PREFIX || 'mcp:stream:';
  const key = `${prefix}${requestId}`;

  try {
    const chunks = await client.lrange(key, 0, -1);
    return chunks;
  } catch (error) {
    console.error('Failed to get cached stream:', error);
    return [];
  }
}

/**
 * Clear stream cache after completion
 */
export async function clearStreamCache(requestId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  // Flush any remaining buffered chunks first
  const buffer = writeBuffer.get(requestId);
  if (buffer && buffer.chunks.length > 0) {
    await flushBuffer(requestId);
  }

  // Remove buffer entry
  writeBuffer.delete(requestId);

  const prefix = process.env.REDIS_STREAM_PREFIX || 'mcp:stream:';
  const key = `${prefix}${requestId}`;

  try {
    await client.del(key);
    console.log(`✓ Stream cache cleared: ${requestId}`);
  } catch (error) {
    console.error('Failed to clear stream cache:', error);
  }
}

/**
 * Generate unique request ID for stream
 */
export function generateRequestId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log('✓ Redis connection closed');
  }
}
