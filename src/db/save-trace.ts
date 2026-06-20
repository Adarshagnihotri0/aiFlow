/**
 * Save Execution Trace to PostgreSQL
 * 
 * Core INSERT logic - fire-and-forget pattern.
 * DB failures are logged but never thrown.
 */

import { getPool } from './client';
import type { ExecutionTraceRow } from '../types/trace';

/**
 * Persist execution trace to database
 * 
 * @param trace - Trace data to save
 * @returns Promise that resolves when INSERT completes (or fails silently)
 */
export async function saveTrace(trace: ExecutionTraceRow): Promise<void> {
  const pool = getPool();

  try {
    await pool.query(
      `INSERT INTO execution_traces (
        trace_id, route,
        routing_ms, prompt_build_ms, adapter_ms, total_ms,
        status, error_message, project_root, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (trace_id) DO NOTHING`,
      [
        trace.trace_id,
        trace.route,
        trace.routing_ms,
        trace.prompt_build_ms,
        trace.adapter_ms,
        trace.total_ms,
        trace.status,
        trace.error_message,
        trace.project_root
      ]
    );
  } catch (err) {
    // Log but don't throw - DB failures must not affect request processing
    console.error('Failed to save execution trace:', {
      trace_id: trace.trace_id,
      route: trace.route,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
