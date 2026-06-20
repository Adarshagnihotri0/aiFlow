/**
 * ExecutionTrace - Stage timing for request execution
 * 
 * Phase 2 minimal scope: ONLY tracks stage durations
 * - routing
 * - prompt_build
 * - adapter (LLM call)
 */

export interface StageRecord {
  name: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
}

export interface ExecutionTrace {
  trace_id: string;
  route: 'anthropic' | 'openai' | 'legacy';
  stages: StageRecord[];
  total_ms: number;
  status: 'success' | 'error' | 'timeout';
  error_message?: string;
}

/**
 * Convert ExecutionTrace to flat format for DB insertion
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
}

/**
 * ExecutionTraceBuilder - Zero-overhead stage timing
 * 
 * Usage:
 *   const trace = new ExecutionTraceBuilder(trace_id);
 *   trace.start("routing");
 *   // ... work ...
 *   trace.end("routing");
 *   const result = trace.complete();
 */
export class ExecutionTraceBuilder {
  private trace_id: string;
  private route: 'anthropic' | 'openai' | 'legacy';
  private stages: StageRecord[] = [];
  private currentStage: { name: string; start: number } | null = null;
  private status: 'success' | 'error' | 'timeout' = 'success';
  private error_message?: string;

  constructor(trace_id: string, route: 'anthropic' | 'openai' | 'legacy') {
    this.trace_id = trace_id;
    this.route = route;
  }

  setError(message: string): void {
    this.status = 'error';
    this.error_message = message;
  }

  start(name: string): void {
    this.currentStage = { name, start: Date.now() };
  }

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

  complete(): ExecutionTrace {
    return {
      trace_id: this.trace_id,
      route: this.route,
      stages: this.stages,
      total_ms: this.stages.reduce((sum, stage) => sum + stage.duration_ms, 0),
      status: this.status,
      error_message: this.error_message
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
      error_message: this.error_message || null
    };
  }
}
