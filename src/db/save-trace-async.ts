/**
 * Async Trace Persistence (Non-Blocking)
 * 
 * Fire-and-forget pattern:
 * - Uses setImmediate to avoid blocking event loop
 * - Logs failures, never throws
 * - Request never waits for DB
 */

import { saveTrace } from './save-trace';
import type { ExecutionTraceRow } from '../types/trace';

/**
 * Save trace asynchronously without blocking request
 * 
 * @param trace - Trace data to persist
 */
export function saveTraceAsync(trace: ExecutionTraceRow): void {
  // Use setImmediate to ensure we don't block the event loop
  setImmediate(() => {
    saveTrace(trace).catch((err) => {
      // Already logged in saveTrace, but double-check
      console.error('Async trace persistence failed:', err);
    });
  });
}
