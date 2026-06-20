/**
 * @adarsh/ai-runtime - AI Runtime Intelligence
 * 
 * Lightweight observability and intelligence SDK for AI systems.
 * 
 * Usage:
 * 
 * import { aiRuntime } from '@adarsh/ai-runtime';
 * 
 * // Manual tracing
 * const t = aiRuntime.trace('my-operation');
 * t.start('step');
 * await doWork();
 * t.end('step');
 * await aiRuntime.sendTrace(t.complete());
 * 
 * // Auto-tracing
 * const tracedFn = aiRuntime.autoTrace('operation', async (data) => {
 *   return processData(data);
 * });
 */

import { TraceBuilder, generateTraceId } from './trace';
import { TraceClient, getDefaultClient } from './client';
import type { SDKConfig, TraceContext, ExecutionTracePayload } from './types';

export { TraceBuilder, generateTraceId } from './trace';
export { TraceClient, getDefaultClient } from './client';
export type { SDKConfig, TraceContext, ExecutionTracePayload, StageRecord } from './types';

/**
 * AI Runtime Client Namespace
 */
export const aiRuntime = {
  /**
   * Create a manual trace for stage tracking
   */
  trace(
    route: string,
    trace_id?: string,
    metadata?: Record<string, unknown>
  ): TraceBuilder {
    const context: TraceContext = {
      trace_id: trace_id || generateTraceId(),
      route,
      metadata,
    };
    return new TraceBuilder(context);
  },

  /**
   * Send completed trace to AI Runtime Daemon
   */
  async sendTrace(payload: ExecutionTracePayload): Promise<boolean> {
    const client = getDefaultClient();
    return await client.sendTrace(payload);
  },

  /**
   * Auto-wrap a function with tracing
   */
  autoTrace<P extends any[], R>(
    route: string,
    fn: (...args: P) => R
  ): (...args: P) => Promise<R> {
    return async (...args: P): Promise<R> => {
      const t = this.trace(route);
      
      try {
        const result = await fn(...args);
        const payload = t.complete();
        await this.sendTrace(payload as ExecutionTracePayload);
        return result;
      } catch (error) {
        t.setError(error instanceof Error ? error.message : String(error));
        const payload = t.complete();
        await this.sendTrace(payload as ExecutionTracePayload);
        throw error;
      }
    };
  },

  /**
   * Configure SDK globally
   */
  configure(config: SDKConfig): void {
    const client = getDefaultClient();
    client.setConfig(config);
  },

  /**
   * Get current SDK configuration
   */
  getConfig(): { endpoint: string; enabled: boolean } {
    const client = getDefaultClient();
    return {
      endpoint: client.getEndpoint(),
      enabled: true,
    };
  },
};

/**
 * Convenience exports for direct access (backward compatibility)
 */
export const trace = aiRuntime.trace;
export const autoTrace = aiRuntime.autoTrace;
export const sendTrace = aiRuntime.sendTrace;
export const configure = aiRuntime.configure;
export const getConfig = aiRuntime.getConfig;

/**
 * SDK version
 */
export const version = '0.1.0';
