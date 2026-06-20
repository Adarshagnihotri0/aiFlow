-- Execution Traces Table (Minimal)
-- Append-only log of every LLM request execution
-- Fire-and-forget writes (async, non-blocking)

CREATE TABLE IF NOT EXISTS execution_traces (
  id SERIAL PRIMARY KEY,
  trace_id TEXT UNIQUE NOT NULL,
  route TEXT NOT NULL,              -- 'anthropic', 'openai', 'legacy'
  
  -- Timing metrics (milliseconds)
  routing_ms INT,
  prompt_build_ms INT,
  adapter_ms INT,
  total_ms INT,
  
  -- Status
  status TEXT,                      -- 'success', 'error', 'timeout'
  error_message TEXT,               -- Optional: error details
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries (minimal, add more later if needed)
CREATE INDEX IF NOT EXISTS idx_execution_traces_route ON execution_traces(route);
CREATE INDEX IF NOT EXISTS idx_execution_traces_created_at ON execution_traces(created_at);
CREATE INDEX IF NOT EXISTS idx_execution_traces_total_ms ON execution_traces(total_ms);

-- Comment for documentation
COMMENT ON TABLE execution_traces IS 'Append-only log of LLM request executions';
COMMENT ON COLUMN execution_traces.trace_id IS 'Unique identifier for request correlation';
COMMENT ON COLUMN execution_traces.route IS 'Route classification: anthropic, openai, or legacy';
COMMENT ON COLUMN execution_traces.total_ms IS 'Total request latency in milliseconds';
