/**
 * PostgreSQL Connection Pool (Minimal)
 * 
 * Direct pg client for execution trace persistence.
 * No ORM overhead - simple INSERT only.
 */

import { Pool } from 'pg';
import 'dotenv/config';

// Connection pool (singleton)
let pool: Pool | null = null;

/**
 * Get or create PostgreSQL connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.warn('DATABASE_URL not set - execution traces will NOT be persisted');
      // Return dummy pool that logs but doesn't fail
      return {
        query: async () => {
          console.warn('Database not configured - trace not saved');
          return { rows: [] };
        },
        end: async () => {},
        on: () => {}
      } as any;
    }

    pool = new Pool({
      connectionString: databaseUrl,
      max: 5, // Minimal pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err); // eslint-disable-line no-console
    });

    pool.on('connect', () => {
      console.log('PostgreSQL connection established'); // eslint-disable-line no-console
    });
  }

  return pool;
}

/**
 * Graceful shutdown
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('PostgreSQL pool closed'); // eslint-disable-line no-console
  }
}
