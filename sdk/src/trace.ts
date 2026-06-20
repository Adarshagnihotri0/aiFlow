/**
 * Trace Builder - Builds execution traces with stage timing
 */

import type { StageRecord, TraceContext } from './types';

export class TraceBuilder {
  private trace_id: string;
  private route: string;
  private metadata?: Record<string, unknown>;
  private stages: StageRecord[] = [];
  private currentStage: { name: string; start: number } | null = null;
  private status: 'success' | 'error' | 'timeout' = 'success';
  private error_message?: string;
  private startTime: number;

  constructor(context: TraceContext) {
    this.trace_id = context.trace_id;
    this.route = context.route;
    this.metadata = context.metadata;
    this.startTime = Date.now();
  }

  /**
   * Start timing a stage
   */
  start(name: string): void {
    this.currentStage = { name, start: Date.now() };
  }

  /**
   * End timing a stage
   */
  end(name: string): void {
    if (!this.currentStage || this.currentStage.name !== name) {
      throw new Error(
        `Stage mismatch: expected ${this.currentStage?.name}, got ${name}`
      );
    }

    const end_time = Date.now();
    this.stages.push({
      name,
      start_time: this.currentStage.start,
      end_time,
      duration_ms: end_time - this.currentStage.start,
    });

    this.currentStage = null;
  }

  /**
   * Mark trace as error
   */
  setError(message: string): void {
    this.status = 'error';
    this.error_message = message;
  }

  /**
   * Mark trace as timeout
   */
  setTimeout(): void {
    this.status = 'timeout';
  }

  /**
   * Complete trace and return payload
   */
  complete(): {
    trace_id: string;
    route: string;
    stages: StageRecord[];
    total_ms: number;
    status: 'success' | 'error' | 'timeout';
    error_message?: string;
    metadata?: Record<string, unknown>;
  } {
    // End any open stage
    if (this.currentStage) {
      this.end(this.currentStage.name);
    }

    return {
      trace_id: this.trace_id,
      route: this.route,
      stages: this.stages,
      total_ms: Date.now() - this.startTime,
      status: this.status,
      error_message: this.error_message,
      metadata: this.metadata,
    };
  }

  /**
   * Get current trace ID
   */
  getTraceId(): string {
    return this.trace_id;
  }
}

/**
 * Generate unique trace ID
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
