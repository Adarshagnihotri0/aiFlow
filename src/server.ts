import express from 'express';
import { invokeModel, invokeModelStream, invokeModelOpenAI, invokeModelStreamOpenAI } from './bedrock';
import { AVAILABLE_MODELS, STATIC_MODEL_ID } from './adapters';
import { contextMiddleware } from './middleware/context';
import { createContextLogger } from './utils/logger';
import './types/context'; // Import to augment Express namespace

const app = express();
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

export default app;
