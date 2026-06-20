/**
 * SDK Types - Shared type definitions
 */

export interface StageRecord {
  name: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
}

export interface ExecutionTracePayload {
  trace_id: string;
  route: string;
  stages: StageRecord[];
  total_ms: number;
  status: 'success' | 'error' | 'timeout';
  error_message?: string;
  metadata?: Record<string, unknown>;
}

export interface SDKConfig {
  endpoint?: string;
  timeout?: number;
  enabled?: boolean;
  silentErrors?: boolean;
}

export interface TraceContext {
  trace_id: string;
  route: string;
  metadata?: Record<string, unknown>;
}
