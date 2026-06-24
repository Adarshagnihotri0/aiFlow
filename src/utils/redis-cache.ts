import Redis from 'ioredis';

let redis: Redis | null = null;

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
 * Store streaming response in Redis cache
 */
export async function cacheStreamResponse(
  requestId: string,
  chunk: string,
  isFinal: boolean = false
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  const prefix = process.env.REDIS_STREAM_PREFIX || 'mcp:stream:';
  const key = `${prefix}${requestId}`;

  try {
    // Append chunk to list
    await client.rpush(key, chunk);
    
    // Set TTL (1 hour default)
    const ttl = parseInt(process.env.REDIS_CACHE_TTL || '3600', 10);
    await client.expire(key, ttl);

    // If final chunk, mark for deletion after TTL
    if (isFinal) {
      // Add marker for completion
      await client.rpush(key, '__STREAM_COMPLETE__');
      console.log(`✓ Stream cached: ${requestId} (marked complete)`);
    }
  } catch (error) {
    console.error('Failed to cache stream response:', error);
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
