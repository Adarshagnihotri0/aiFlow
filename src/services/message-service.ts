/**
 * Message Service - Orchestration layer for LLM message processing
 * 
 * Extracted from: src/server.ts
 * Follows pattern: GOOD_FACTORY_FUNCTION.md
 * ADR-001 compliance: Factory function, not class
 * 
 * Responsibilities:
 * - Orchestrate message processing workflow
 * - Manage tracing lifecycle
 * - Coordinate adapter calls
 * - Handle persistence
 */

import type { ExecutionContext } from '../types/context';
import type { ExecutionTraceRow } from '../types/trace';
import { saveTraceAsync } from '../db/save-trace-async';

/**
 * Message input for processing
 */
export interface MessageInput {
  body: Record<string, unknown>;
  streaming: boolean;
  context: ExecutionContext;
  route: 'anthropic' | 'openai' | 'legacy';
}

/**
 * Message output (handled internally, not returned to transport)
 */
export interface MessageOutput {
  success: boolean;
  traceId?: string;
  error?: string;
}

/**
 * Adapter interface for dependency injection
 */
export interface MessageAdapters {
  invokeAnthropic: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  invokeAnthropicStream: (body: Record<string, unknown>, res: unknown) => Promise<void>;
  invokeOpenAI: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  invokeOpenAIStream: (body: Record<string, unknown>, res: unknown) => Promise<void>;
}

/**
 * Message Service interface
 */
export interface MessageService {
  processMessage(input: MessageInput, res: unknown): Promise<MessageOutput>;
}

/**
 * Factory: Creates message service with dependency injection
 * 
 * ADR-001: Factory function pattern
 * Good pattern from: src/utils/logger.ts (createContextLogger)
 */
export function createMessageService(adapters: MessageAdapters): MessageService {
  return {
    async processMessage(input: MessageInput, res: unknown): Promise<MessageOutput> {
      const { body, streaming, context, route } = input;
      
      try {
        // Orchestration: Adapter selection (previously in server.ts)
        if (route === 'anthropic') {
          if (streaming) {
            await adapters.invokeAnthropicStream(body, res);
          } else {
            const result = await adapters.invokeAnthropic(body);
            // Response sent by caller
          }
        } else if (route === 'openai' || route === 'legacy') {
          if (streaming) {
            await adapters.invokeOpenAIStream(body, res);
          } else {
            const result = await adapters.invokeOpenAI(body);
            // Response sent by caller
          }
        } else {
          throw new Error(`Unknown route: ${route}`);
        }

        // Persistence: Trace recording (previously skip-layer violation)
        const traceRow: ExecutionTraceRow = {
          trace_id: context.trace_id,
          route: context.route,
          routing_ms: 0,
          prompt_build_ms: 0,
          adapter_ms: Date.now() - context.start_time,
          total_ms: Date.now() - context.start_time,
          status: 'success',
          error_message: null,
          project_root: null
        };
        
        // Fixed: Service → Repository (no skip-layer)
        saveTraceAsync(traceRow);

        return { success: true, traceId: context.trace_id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        
        // Persistence: Error trace
        const traceRow: ExecutionTraceRow = {
          trace_id: context.trace_id,
          route: context.route,
          routing_ms: 0,
          prompt_build_ms: 0,
          adapter_ms: Date.now() - context.start_time,
          total_ms: Date.now() - context.start_time,
          status: 'error',
          error_message: message,
          project_root: null
        };
        
        saveTraceAsync(traceRow);
        
        return { success: false, error: message };
      }
    }
  };
}
