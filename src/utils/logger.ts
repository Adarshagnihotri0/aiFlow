/**
 * Structured Logger with Trace Context
 * 
 * Extends Winston logger with:
 * - Automatic trace_id injection
 * - JSON structured output
 * - Context-aware logging
 */

import winston from 'winston';
import type { ExecutionContext } from '../types/context';

/**
 * Create base Winston logger instance
 */
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bedrock-proxy' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, trace_id, ...meta }) => {
          const tracePrefix = trace_id && typeof trace_id === 'string' ? `[${trace_id}] ` : '';
          const ts = typeof timestamp === 'string' ? timestamp : String(timestamp);
          const lvl = typeof level === 'string' ? level : String(level);
          const msg = typeof message === 'string' ? message : String(message);
          return `${ts} ${lvl}: ${tracePrefix}${msg} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    })
  ]
});

/**
 * Logger interface with context support
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Create a context-aware logger that automatically injects trace_id
 */
export function createContextLogger(context: ExecutionContext): Logger {
  const log = (level: string, message: string, meta: Record<string, unknown> = {}): void => {
    baseLogger.log(level, message, {
      trace_id: context.trace_id,
      route: context.route,
      ...meta
    });
  };

  return {
    info: (msg, meta) => log('info', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta)
  };
}

/**
 * Export base logger for system-level logs
 */
export const logger = baseLogger;
