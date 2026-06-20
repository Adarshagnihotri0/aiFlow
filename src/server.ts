import express from 'express';
import { invokeModel, invokeModelStream, invokeModelOpenAI, invokeModelStreamOpenAI } from './bedrock';
import { AVAILABLE_MODELS, STATIC_MODEL_ID } from './adapters';

const app = express();
app.use(express.json({ limit: '10mb' }));

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
  try {
    const body = req.body as Record<string, unknown>;
    const isStream = body['stream'] === true;

    console.log(`[${new Date().toISOString()}] anthropic ${isStream ? 'stream' : 'sync '} → ${STATIC_MODEL_ID}`);

    if (isStream) {
      console.log("streaming response...2");
      await invokeModelStream(body, res);
    } else {
      console.log("streaming response...1");
      const result = await invokeModel(body);
      res.json(result);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Bedrock error:', message);
    res.status(500).json({ type: 'error', error: { type: 'bedrock_error', message } });
  }
});

// ── Legacy completions → convert to chat/completions ─────────────────────────
app.post('/v1/completions', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const prompt = typeof body['prompt'] === 'string' ? body['prompt'] : '';
    const chatBody = { ...body, messages: [{ role: 'user', content: prompt }] } as any;
    const isStream = chatBody['stream'] === true;

    console.log(`[${new Date().toISOString()}] legacy   ${isStream ? 'stream' : 'sync '} → ${STATIC_MODEL_ID}`);

    if (isStream) {
      await invokeModelStreamOpenAI(chatBody, res);
    } else {
      const result = await invokeModelOpenAI(chatBody);
      res.json(result);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Bedrock error:', message);
    res.status(500).json({ error: { message, type: 'bedrock_error', code: 500 } });
  }
});

// ── OpenAI chat/completions endpoint ─────────────────────────────────────────
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const isStream = body['stream'] === true;

    console.log(`[${new Date().toISOString()}] openai   ${isStream ? 'stream' : 'sync '} → ${STATIC_MODEL_ID}`);

    if (isStream) {
      await invokeModelStreamOpenAI(body, res);
    } else {
      const result = await invokeModelOpenAI(body);
      res.json(result);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Bedrock error:', message);
    res.status(500).json({ error: { message, type: 'bedrock_error', code: 500 } });
  }
});

export default app;
