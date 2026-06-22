/**
 * API Request/Response Types
 * 
 * Type definitions for Express request bodies and responses.
 * Ensures type safety across all API endpoints.
 */

/**
 * Base request body structure
 */
export interface BaseRequestBody {
  stream?: boolean;
}

/**
 * Anthropic messages API request
 */
export interface AnthropicMessagesRequest extends BaseRequestBody {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
}

/**
 * OpenAI chat completions request
 */
export interface OpenAIChatCompletionsRequest extends BaseRequestBody {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    name?: string;
    tool_calls?: unknown[];
  }>;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Legacy completions request
 */
export interface LegacyCompletionsRequest extends BaseRequestBody {
  prompt: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * SDK trace ingestion request
 */
export interface TraceIngestionRequest {
  trace_id: string;
  route: string;
  routing_ms?: number | null;
  prompt_build_ms?: number | null;
  adapter_ms?: number | null;
  total_ms?: number;
  status?: string;
  error_message?: string | null;
  project_root?: string | null;
}

/**
 * Type guard for Anthropic messages request
 */
export function isAnthropicMessagesRequest(body: unknown): body is AnthropicMessagesRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return 'messages' in b && Array.isArray(b['messages']);
}

/**
 * Type guard for OpenAI chat completions request
 */
export function isOpenAIChatCompletionsRequest(body: unknown): body is OpenAIChatCompletionsRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return 'messages' in b && Array.isArray(b['messages']);
}

/**
 * Type guard for legacy completions request
 */
export function isLegacyCompletionsRequest(body: unknown): body is LegacyCompletionsRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return 'prompt' in b && typeof b['prompt'] === 'string';
}

/**
 * Type guard for trace ingestion request
 */
export function isTraceIngestionRequest(body: unknown): body is TraceIngestionRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return 'trace_id' in b && 'route' in b;
}
