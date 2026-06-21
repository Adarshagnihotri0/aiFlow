/**
 * Trace Service - Orchestration layer for trace persistence
 * 
 * Responsibilities moved from server.ts:
 * 1. Trace ingestion logic (POST /api/v1/traces)
 * 2. Trace retrieval logic (GET /api/v1/traces/:id)
 * 3. Database coordination
 * 4. Error handling
 * 
 * BC-006 violations resolved: 2
 * - Removed saveTraceAsync import from server.ts
 * - Removed getPool import from server.ts
 */

import type { ExecutionTraceRow } from '../types/trace';

/**
 * Dependencies for trace service
 */
export interface TraceServiceDeps {
  saveTraceAsync: (trace: ExecutionTraceRow) => void;
  getPool: () => {
    query: (sql: string, params: any[]) => Promise<{ rows: any[] }>;
  };
}

/**
 * Trace payload from API request
 */
export interface TracePayload {
  trace_id: string;
  route: string;
  status: string;
  total_ms: number;
  stages?: Array<{
    name: string;
    duration_ms: number;
  }>;
  error_message?: string;
  project_root?: string;
}

/**
 * Trace service interface
 */
export interface TraceService {
  ingestTrace: (payload: TracePayload) => {
    trace_id: string;
    received_at: string;
    api_version: string;
  };
  getTrace: (traceId: string) => Promise<{
    found: boolean;
    trace?: any;
    error?: string;
  }>;
}

/**
 * Create trace service with dependency injection
 * 
 * @param deps - Service dependencies (db operations)
 * @returns TraceService instance
 * 
 * @example
 * ```typescript
 * import { saveTraceAsync } from '../db/save-trace-async';
 * import { getPool } from '../db/client';
 * 
 * const traceService = createTraceService({ saveTraceAsync, getPool });
 * 
 * // In route handler:
 * const result = traceService.ingestTrace(req.body);
 * res.json(result);
 * ```
 */
export function createTraceService(deps: TraceServiceDeps): TraceService {
  return {
    /**
     * Ingest trace from API request
     * Transforms payload to database row and persists
     */
    ingestTrace: (payload: TracePayload) => {
      const traceRow: ExecutionTraceRow = {
        trace_id: payload.trace_id,
        route: payload.route,
        routing_ms: payload.stages?.find(s => s.name === 'routing')?.duration_ms || null,
        prompt_build_ms: payload.stages?.find(s => s.name === 'prompt_build')?.duration_ms || null,
        adapter_ms: payload.stages?.find(s => s.name === 'adapter')?.duration_ms || null,
        total_ms: payload.total_ms,
        status: payload.status,
        error_message: payload.error_message || null,
        project_root: payload.project_root || null
      };

      // Fire-and-forget async persistence
      deps.saveTraceAsync(traceRow);

      return {
        trace_id: payload.trace_id,
        received_at: new Date().toISOString(),
        api_version: 'v1'
      };
    },

    /**
     * Retrieve trace by ID from database
     */
    getTrace: async (traceId: string) => {
      try {
        const pool = deps.getPool();
        const result = await pool.query(
          'SELECT * FROM execution_traces WHERE trace_id = $1',
          [traceId]
        );

        if (result.rows.length === 0) {
          return { found: false, error: 'Trace not found' };
        }

        const trace = result.rows[0];

        // Format for readability
        const formatted = {
          trace_id: trace.trace_id,
          route: trace.route,
          timing: {
            routing_ms: trace.routing_ms,
            prompt_build_ms: trace.prompt_build_ms,
            adapter_ms: trace.adapter_ms,
            total_ms: trace.total_ms
          },
          status: trace.status,
          error_message: trace.error_message,
          project_root: trace.project_root,
          created_at: trace.created_at
        };

        return { found: true, trace: formatted };
      } catch (error) {
        return {
          found: false,
          error: error instanceof Error ? error.message : 'Database error'
        };
      }
    }
  };
}
