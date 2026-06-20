-- Phase 7: Project-Scoped Tracing
-- Adds project_root column to enable project-specific trace queries

ALTER TABLE execution_traces 
ADD COLUMN IF NOT EXISTS project_root TEXT;

-- Create index for efficient project-scoped queries
CREATE INDEX IF NOT EXISTS idx_execution_traces_project_root 
ON execution_traces(project_root);

-- Add documentation
COMMENT ON COLUMN execution_traces.project_root IS 'Absolute path of the project that generated this trace (for project-scoped queries)';
