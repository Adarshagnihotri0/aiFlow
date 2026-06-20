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
  stages: StageRecord[];
  total_ms: number;
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
  private stages: StageRecord[] = [];
  private currentStage: { name: string; start: number } | null = null;

  constructor(trace_id: string) {
    this.trace_id = trace_id;
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
      stages: this.stages,
      total_ms: this.stages.reduce((sum, stage) => sum + stage.duration_ms, 0)
    };
  }
}
