/**
 * Trace Builder - SDK tracing for external applications
 * 
 * Standalone implementation for SDK traces with:
 * - Metadata support (arbitrary key-value pairs)
 * - Project root auto-capture
 * - Wall-clock timing (not stage aggregation)
 * - Timeout status support
 * 
 * Used by: External applications sending traces to server
 */

/**
 * Stage record - Individual timing stage within a trace
 */
export interface StageRecord {
  name: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
}

/**
 * Trace status
 */
export type TraceStatus = 'success' | 'error' | 'timeout';

/**
 * Trace context for SDK initialization
 */
export interface TraceContext {
  trace_id: string;
  route: string;
  project_root?: string;
  metadata?: Record<string, unknown>;
}

/**
 * SDK trace payload (sent to server)
 */
export interface ExecutionTracePayload {
  trace_id: string;
  route: string;
  stages: StageRecord[];
  total_ms: number;
  status: TraceStatus;
  error_message?: string;
  project_root?: string;
  metadata?: Record<string, unknown>;
}

/**
 * TraceBuilder - SDK tracing with metadata and project root
 * 
 * Usage:
 *   const t = new TraceBuilder({ trace_id: '...', route: 'my-operation' });
 *   t.start('validation');
 *   await validate();
 *   t.end('validation');
 *   const payload = t.complete();
 */
export class TraceBuilder {
  private trace_id: string;
  private route: string;
  private project_root?: string;
  private metadata?: Record<string, unknown>;
  private stages: StageRecord[] = [];
  private currentStage: { name: string; start: number } | null = null;
  private status: TraceStatus = 'success';
  private error_message?: string;
  private startTime: number;

  constructor(context: TraceContext) {
    this.trace_id = context.trace_id;
    this.route = context.route;
    this.project_root = context.project_root || process.cwd();
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
   * Get project root
   */
  getProjectRoot(): string | undefined {
    return this.project_root;
  }

  /**
   * Get metadata
   */
  getMetadata(): Record<string, unknown> | undefined {
    return this.metadata;
  }

  /**
   * Get trace ID
   */
  getTraceId(): string {
    return this.trace_id;
  }

  /**
   * Complete trace and return payload
   * Uses wall-clock timing for total_ms (not stage aggregation)
   */
  complete(): ExecutionTracePayload {
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
      project_root: this.project_root,
      metadata: this.metadata,
    };
  }
}

/**
 * Generate unique trace ID
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
