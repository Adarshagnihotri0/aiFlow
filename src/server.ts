import express from 'express';
import { invokeModel, invokeModelStream, invokeModelOpenAI, invokeModelStreamOpenAI } from './bedrock';
import { AVAILABLE_MODELS, STATIC_MODEL_ID } from './adapters';
import { contextMiddleware } from './middleware/context';
import { createContextLogger } from './utils/logger';
import { createTraceService } from './services/trace-service';
import { saveTraceAsync } from './db/save-trace-async';
import { getPool } from './db/client';
import './types/context'; // Import to augment Express namespace

const app = express();

// Initialize trace service with dependency injection
const traceService = createTraceService({ saveTraceAsync, getPool });
app.use(express.json({ limit: '10mb' }));
app.use(contextMiddleware);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Model list (Claude Code calls this on startup) ────────────────────────────
app.get('/v1/models', (_req, res) => {
  res.json({ object: 'list', data: AVAILABLE_MODELS });
});

// ── Anthropic messages endpoint ───────────────────────────────────────────────
app.post('/v1/messages', async (req, res) => {
  const logger = req.context ? createContextLogger(req.context) : null;
  const trace = req.trace;
  
  try {
    // Stage 1: Routing (already done by middleware)
    trace?.start('routing');
    trace?.end('routing');
    
    // Stage 2: Prompt build (placeholder - no transformation needed for Anthropic route)
    trace?.start('prompt_build');
    const body = req.body as Record<string, unknown>;
    trace?.end('prompt_build');
    
    const isStream = body['stream'] === true;

    logger?.info('Processing Anthropic request', {
      streaming: isStream,
      model: STATIC_MODEL_ID
    });

    // Stage 3: Adapter (LLM call)
    trace?.start('adapter');
    if (isStream) {
      await invokeModelStream(body, res);
    } else {
      const result = await invokeModel(body);
      res.json(result);
    }
    trace?.end('adapter');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.error('Bedrock error', { error: message });
    res.status(500).json({ type: 'error', error: { type: 'bedrock_error', message } });
  }
});

// ── Legacy completions → convert to chat/completions ─────────────────────────
app.post('/v1/completions', async (req, res) => {
  const logger = req.context ? createContextLogger(req.context) : null;
  const trace = req.trace;
  
  try {
    // Stage 1: Routing
    trace?.start('routing');
    trace?.end('routing');
    
    // Stage 2: Prompt build (convert legacy format)
    trace?.start('prompt_build');
    const body = req.body as Record<string, unknown>;
    const prompt = typeof body['prompt'] === 'string' ? body['prompt'] : '';
    const chatBody = { ...body, messages: [{ role: 'user', content: prompt }] } as any;
    trace?.end('prompt_build');
    
    const isStream = chatBody['stream'] === true;

    logger?.info('Processing legacy request', {
      streaming: isStream,
      model: STATIC_MODEL_ID
    });

    // Stage 3: Adapter (LLM call)
    trace?.start('adapter');
    if (isStream) {
      await invokeModelStreamOpenAI(chatBody, res);
    } else {
      const result = await invokeModelOpenAI(chatBody);
      res.json(result);
    }
    trace?.end('adapter');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.error('Bedrock error', { error: message });
    res.status(500).json({ error: { message, type: 'bedrock_error', code: 500 } });
  }
});

// ── OpenAI chat/completions endpoint ─────────────────────────────────────────
app.post('/v1/chat/completions', async (req, res) => {
  const logger = req.context ? createContextLogger(req.context) : null;
  const trace = req.trace;
  
  try {
    // Stage 1: Routing
    trace?.start('routing');
    trace?.end('routing');
    
    // Stage 2: Prompt build (no transformation needed)
    trace?.start('prompt_build');
    const body = req.body as Record<string, unknown>;
    trace?.end('prompt_build');
    
    const isStream = body['stream'] === true;

    logger?.info('Processing OpenAI request', {
      streaming: isStream,
      model: STATIC_MODEL_ID
    });

    // Stage 3: Adapter (LLM call)
    trace?.start('adapter');
    if (isStream) {
      await invokeModelStreamOpenAI(body, res);
    } else {
      const result = await invokeModelOpenAI(body);
      res.json(result);
    }
    trace?.end('adapter');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.error('Bedrock error', { error: message });
    res.status(500).json({ error: { message, type: 'bedrock_error', code: 500 } });
  }
});

// ── Trace ingestion endpoint for SDK clients ─────────────────────────────────────
app.post('/trace', (req, res) => {
  try {
    const tracePayload = req.body;
    
    // Validate trace payload
    if (!tracePayload.trace_id || !tracePayload.route) {
      res.status(400).json({ error: 'Invalid trace payload' });
      return;
    }

    // Log received trace
    const logger = createContextLogger({
      trace_id: tracePayload.trace_id,
      route: tracePayload.route,
      timestamp: new Date().toISOString(),
      method: 'TRACE',
      path: '/trace',
      start_time: Date.now(),
    });

    logger.info('Trace received', {
      route: tracePayload.route,
      status: tracePayload.status,
      total_ms: tracePayload.total_ms,
      stages: tracePayload.stages?.length || 0
    });

    // TODO: Persist trace to database (reusing existing save-trace infrastructure)
    // For now, just acknowledge receipt
    res.json({ 
      status: 'ok', 
      trace_id: tracePayload.trace_id,
      received_at: new Date().toISOString()
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Trace ingestion error:', message);
    res.status(500).json({ error: 'Failed to process trace' });
  }
});

// ── Versioned trace endpoint (canonical) ────────────────────────────────────────
app.post('/api/v1/traces', async (req, res) => {
  try {
    const tracePayload = req.body;
    
    // Validate trace payload
    if (!tracePayload.trace_id || !tracePayload.route) {
      res.status(400).json({ error: 'Invalid trace payload' });
      return;
    }

    // Log received trace
    const logger = createContextLogger({
      trace_id: tracePayload.trace_id,
      route: tracePayload.route,
      timestamp: new Date().toISOString(),
      method: 'TRACE',
      path: '/api/v1/traces',
      start_time: Date.now(),
    });

    logger.info('Trace received (v1 API)', {
      route: tracePayload.route,
      status: tracePayload.status,
      total_ms: tracePayload.total_ms,
      stages: tracePayload.stages?.length || 0,
      project_root: tracePayload.project_root
    });

    // Use trace service for persistence
    const result = traceService.ingestTrace(tracePayload);
    res.json({ status: 'ok', ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Trace ingestion error (v1):', message);
    res.status(500).json({ error: 'Failed to process trace' });
  }
});

// ── Context endpoint for CLI - Returns AI-ready project context ───────────────
app.get('/api/v1/context', async (req, res) => {
  try {
    const root = req.query.root as string;
    
    if (!root) {
      res.status(400).json({ error: 'Missing root parameter' });
      return;
    }

    const fs = await import('fs');
    const path = await import('path');
    const childProcess = await import('child_process');
    
    // 1. Derive project name (no config required)
    let projectName = path.basename(root);
    let packageJson: any = null;
    
    if (fs.existsSync(path.join(root, 'package.json'))) {
      try {
        packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
        projectName = packageJson.name || projectName;
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    // 2. Git status (execute in project directory)
    let gitBranch = 'unknown';
    let gitStatus = '';
    let gitRemote = '';
    
    try {
      gitBranch = childProcess.execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf-8' }).trim();
      gitStatus = childProcess.execSync('git status --short', { cwd: root, encoding: 'utf-8' }).trim();
      gitRemote = childProcess.execSync('git remote get-url origin 2>/dev/null || echo ""', { cwd: root, encoding: 'utf-8' }).trim();
    } catch (e) {
      // Not a git repo or git not installed
    }
    
    // 3. Scan important files with metadata
    const { readFileSync: readFile } = await import('fs');
    const importantFiles: Array<{ path: string; lines?: number; is_entry_point?: boolean }> = [];
    
    // Extract entry point from package.json
    const entryPoint = packageJson?.main || null;
    
    const countLines = (filePath: string): number => {
      try {
        const content = readFile(filePath, 'utf-8');
        return content.split('\n').length;
      } catch {
        return 0;
      }
    };
    
    try {
      // Files to always include
      const criticalFiles = ['package.json', 'README.md', 'tsconfig.json', 'docker-compose.yml', 'Dockerfile'];
      criticalFiles.forEach(file => {
        const fullPath = path.join(root, file);
        if (fs.existsSync(fullPath)) {
          const lines = countLines(fullPath);
          importantFiles.push({ path: file, lines });
        }
      });
      
      // Scan root directory for JS/TS files (including entry point)
      try {
        const rootFiles = fs.readdirSync(root);
        rootFiles.forEach(file => {
          if (/\.(js|ts|jsx|tsx)$/.test(file)) {
            const fullPath = path.join(root, file);
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
              const lines = countLines(fullPath);
              const isEntryPoint = entryPoint && entryPoint === file;
              importantFiles.push({ 
                path: file, 
                lines,
                is_entry_point: isEntryPoint
              });
            }
          }
        });
      } catch (e) {
        // Ignore git/traverse errors - not critical
      }
      
      // Mark entry point if found in package.json (already added above)
      if (entryPoint) {
        importantFiles.forEach(file => {
          if (file.path === entryPoint) {
            file.is_entry_point = true;
          }
        });
      }
      
      // Scan src/ directory if exists
      const srcDir = path.join(root, 'src');
      if (fs.existsSync(srcDir)) {
        const scanDir = (dir: string, prefix: string = '') => {
          try {
            const entries = fs.readdirSync(dir);
            entries.forEach(entry => {
              if (entry.startsWith('.') || entry === 'node_modules') return;
              
              const fullPath = path.join(dir, entry);
              const stat = fs.statSync(fullPath);
              const relativePath = prefix ? `${prefix}/${entry}` : entry;
              
              if (stat.isDirectory()) {
                scanDir(fullPath, relativePath);
              } else if (stat.isFile() && /\.(ts|js|jsx|tsx|py|go|rs)$/.test(entry)) {
                const lines = countLines(fullPath);
                const filePath = `src/${relativePath}`;
                const isEntryPoint = entryPoint && (
                  entryPoint === filePath ||
                  entryPoint.replace(/^dist\//, 'src/') === filePath ||
                  entryPoint.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts') === filePath
                );
                importantFiles.push({ 
                  path: filePath, 
                  lines,
                  is_entry_point: isEntryPoint
                });
              }
            });
          } catch (e) {
            // Ignore file stat errors - file may not exist or be inaccessible
          }
        };
        scanDir(srcDir);
      }
    } catch (e) {
      console.warn('Could not scan files:', e);
    }
    
    // 4. Deep mode: Add file previews
    const deep = req.query.deep === 'true';
    if (deep && importantFiles.length > 0) {
      const fs = await import('fs');
      importantFiles.forEach((file: any) => {
        if (file.path && file.lines && file.lines < 500) {  // Only preview files < 500 lines
          try {
            const fullPath = path.join(root, file.path);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const previewLines = content.split('\n').slice(0, 20);
            file.preview = previewLines.join('\n');
          } catch (e) {
            // Skip preview if can't read
          }
        }
      });
    }
    
    // 5. Query recent traces from database (project-scoped)
    const { getPool } = await import('./db/client');
    const pool = getPool();
    
    let traces: any[] = [];
    try {
      const result = await pool.query(`
        SELECT trace_id, route, total_ms, status, created_at as timestamp
        FROM execution_traces
        WHERE project_root = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [root]);
      traces = result.rows;
    } catch (e) {
      // Database might not be initialized yet
      console.warn('Could not fetch traces:', e);
    }
    
    // 5. Build warnings
    const warnings: string[] = [];
    if (!packageJson) warnings.push('No package.json found');
    if (!gitBranch || gitBranch === 'unknown') warnings.push('Not a git repository');
    
    // 6. Build recommendations
    const recommendations: string[] = [];
    if (traces.length === 0) {
      recommendations.push('Run tasks to build trace history');
    }
    
    // 7. Extract dependencies
    const dependencies = {
      production: packageJson?.dependencies ? Object.keys(packageJson.dependencies) : [],
      development: packageJson?.devDependencies ? Object.keys(packageJson.devDependencies) : []
    };
    
    res.json({
      project: {
        name: projectName,
        root,
        package_manager: packageJson ? 'npm' : 'unknown'
      },
      git: {
        branch: gitBranch,
        remote: gitRemote,
        status: gitStatus || null
      },
      important_files: importantFiles,
      dependencies,
      traces,
      warnings,
      recommendations
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Context generation error:', message);
    res.status(500).json({ error: 'Failed to generate context' });
  }
});

// ── Trace detail endpoint ───────────────────────────────────────────────────────
app.get('/api/v1/traces/:id', async (req, res) => {
  try {
    const traceId = req.params.id;
    const result = await traceService.getTrace(traceId);
    
    if (!result.found) {
      res.status(404).json({ error: result.error || 'Trace not found' });
      return;
    }
    
    res.json(result.trace);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Trace fetch error:', message);
    res.status(500).json({ error: 'Failed to fetch trace' });
  }
});

export default app;
