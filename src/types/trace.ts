/**
 * ExecutionTrace - Server internal request tracing
 * 
 * Standalone implementation for server traces with:
 * - Route type restrictions (anthropic, openai, legacy)
 * - DB serialization (toRow)
 * - Stage-duration aggregation for total_ms
 * 
 * Used by: Express middleware for internal request tracing
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
 * Server route classification
 */
export type ServerRouteType = 'anthropic' | 'openai' | 'legacy';

/**
 * Execution trace payload (server-internal)
 */
export interface ExecutionTrace {
  trace_id: string;
  route: ServerRouteType;
  stages: StageRecord[];
  total_ms: number;
  status: TraceStatus;
  error_message?: string;
}

/**
 * Flat format for DB insertion
 */
export interface ExecutionTraceRow {
  trace_id: string;
  route: string;
  routing_ms: number | null;
  prompt_build_ms: number | null;
  adapter_ms: number | null;
  total_ms: number;
  status: string;
  error_message: string | null;
  project_root: string | null;
}

/**
 * ExecutionTraceBuilder - Server internal tracing with route validation
 * 
 * Usage:
 *   const trace = new ExecutionTraceBuilder(trace_id, 'anthropic');
 *   trace.start("routing");
 *   // ... work ...
 *   trace.end("routing");
 *   const result = trace.complete();
 */
export class ExecutionTraceBuilder {
  private trace_id: string;
  private route: ServerRouteType;
  private stages: StageRecord[] = [];
  private currentStage: { name: string; start: number } | null = null;
  private status: TraceStatus = 'success';
  private error_message?: string;

  constructor(trace_id: string, route: ServerRouteType) {
    this.trace_id = trace_id;
    this.route = route;
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
      throw new Error(`Stage mismatch: expected ${this.currentStage?.name}, got ${name}`);
    }
    
    const end_time = Date.now();
    this.stages.push({
      name,
      start_time: this.currentStage.start,
      end_time,
      duration_ms: end_time - this.currentStage.start
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
   * Get route type (server-restricted)
   */
  getRouteType(): ServerRouteType {
    return this.route;
  }

  /**
   * Get trace ID
   */
  getTraceId(): string {
    return this.trace_id;
  }

  /**
   * Complete trace and return payload
   * Uses stage-duration aggregation for total_ms (not wall-clock)
   */
  complete(): ExecutionTrace {
    return {
      trace_id: this.trace_id,
      route: this.route,
      stages: this.stages,
      total_ms: this.stages.reduce((sum, stage) => sum + stage.duration_ms, 0),
      status: this.status,
      error_message: this.error_message,
    };
  }

  /**
   * Convert to flat DB row format
   */
  toRow(): ExecutionTraceRow {
    const getStageMs = (name: string): number | null => {
      const stage = this.stages.find(s => s.name === name);
      return stage ? stage.duration_ms : null;
    };

    return {
      trace_id: this.trace_id,
      route: this.route,
      routing_ms: getStageMs('routing'),
      prompt_build_ms: getStageMs('prompt_build'),
      adapter_ms: getStageMs('adapter'),
      total_ms: this.stages.reduce((sum, stage) => sum + stage.duration_ms, 0),
      status: this.status,
      error_message: this.error_message || null,
      project_root: null
    };
  }
}
