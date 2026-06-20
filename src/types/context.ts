/**
 * ExecutionContext - Request tracing and routing metadata
 * 
 * Attached to every request to enable:
 * - Distributed tracing across logs
 * - Route classification (anthropic, openai, legacy)
 * - Performance monitoring
 */

export type RouteType = 'anthropic' | 'openai' | 'legacy';

export interface ExecutionContext {
  /** Unique identifier for tracing across multiple log lines */
  trace_id: string;
  
  /** Route classification for policy resolution */
  route: RouteType;
  
  /** ISO timestamp when request entered system */
  timestamp: string;
  
  /** Request method for debugging */
  method: string;
  
  /** Request path for debugging */
  path: string;
  
  /** High-resolution start time for stage timing (Phase 2) */
  start_time: number;
}

/**
 * Extend Express Request to include execution context
 */
declare global {
  namespace Express {
    interface Request {
      context?: ExecutionContext;
    }
  }
}

/**
 * Factory function type for creating execution contexts
 */
export type CreateContextFunction = (
  method: string,
  path: string
) => ExecutionContext;
