/**
 * Context Response Types
 * 
 * Type definitions for CLI context responses from the AI Runtime server
 */

/**
 * Project metadata
 */
export interface ProjectMetadata {
  name: string;
  root: string;
  package_manager: string;
}

/**
 * Git status information
 */
export interface GitStatus {
  branch: string;
  remote: string;
  status: string | null;
}

/**
 * File metadata with optional preview
 */
export interface FileMetadata {
  path: string;
  lines?: number;
  is_entry_point?: boolean;
  preview?: string;
}

/**
 * Project dependencies
 */
export interface Dependencies {
  production: string[];
  development: string[];
}

/**
 * Trace record from database
 */
export interface TraceRecord {
  trace_id: string;
  route: string;
  total_ms: number;
  status: string;
  timestamp: string;
}

/**
 * Full context response from /api/v1/context
 */
export interface ContextResponse {
  project: ProjectMetadata;
  git: GitStatus;
  important_files: FileMetadata[];
  dependencies: Dependencies;
  traces: TraceRecord[];
  warnings: string[];
  recommendations: string[];
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  error: string;
  message?: string;
}
