/**
 * Execution Context Middleware
 * 
 * Attaches ExecutionContext to every request:
 * - Generates unique trace_id
 * - Classifies route type (anthropic, openai, legacy)
 * - Captures request metadata
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ExecutionContext, RouteType } from '../types/context';
import { ExecutionTraceBuilder } from '../types/trace';
import { createContextLogger } from '../utils/logger';
import { saveTraceAsync } from '../db/save-trace-async';

// Extend Express Request to include trace
declare global {
  namespace Express {
    interface Request {
      context?: ExecutionContext;
      trace?: ExecutionTraceBuilder;
    }
  }
}

/**
 * Determine route type based on request path
 */
function classifyRoute(path: string): RouteType {
  if (path.startsWith('/v1/messages')) {
    return 'anthropic';
  } else if (path.startsWith('/v1/chat/completions')) {
    return 'openai';
  } else if (path.startsWith('/v1/completions')) {
    return 'legacy';
  }
  return 'openai'; // Default fallback
}

/**
 * Create execution context for a request
 */
function createExecutionContext(method: string, path: string): ExecutionContext {
  return {
    trace_id: uuidv4(),
    route: classifyRoute(path),
    timestamp: new Date().toISOString(),
    method,
    path,
    start_time: Date.now()
  };
}

/**
 * Middleware to attach execution context to request
 */
export function contextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Create execution context
  const context = createExecutionContext(req.method, req.path);
  
  // Attach to request object
  req.context = context;
  
  // Create execution trace builder with route classification
  const trace = new ExecutionTraceBuilder(context.trace_id, context.route);
  req.trace = trace;
  
  // Create context-aware logger
  const logger = createContextLogger(context);
  
  // Log request entry
  logger.info('Request received', {
    method: context.method,
    path: context.path,
    route: context.route
  });
  
  // Persistence middleware: Async save trace on response finish
  res.on('finish', () => {
    // Set error status if request failed
    if (res.statusCode >= 400) {
      trace.setError(`HTTP ${res.statusCode}`);
    }
    
    // Build and persist trace asynchronously (fire-and-forget)
    const completedTrace = trace.complete();
    const traceRow = trace.toRow();
    saveTraceAsync(traceRow);
    
    // Log with trace structure
    logger.info('Request completed', {
      statusCode: res.statusCode,
      trace: completedTrace
    });
  });
  
  // Continue to next middleware
  next();
}

/**
 * Type guard to check if request has context
 */
export function hasContext(req: Request): req is Request & { context: ExecutionContext } {
  return req.context !== undefined;
}
