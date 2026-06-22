/**
 * Integration Example - Express middleware with MCP tracing
 */

import express from 'express';
import { trace, sendTrace } from '@adarsh/ai-runtime';

const app = express();

// Middleware: Add tracing to every request
app.use(async (req, res, next) => {
  const t = trace('http-request', undefined, {
    method: req.method,
    path: req.path,
    userAgent: req.get('user-agent'),
  });

  // Attach trace to request
  (req as any).trace = t;

  // Track middleware stage
  t.start('middleware');

  // Hook into response finish to send trace
  res.on('finish', async () => {
    t.end('middleware');

    // Mark errors for 4xx/5xx responses
    if (res.statusCode >= 400) {
      t.setError(`HTTP ${res.statusCode}`);
    }

    const payload = t.complete();
    await sendTrace(payload);
  });

  next();
});

// Example endpoint
app.get('/api/users/:id', async (req, res) => {
  const t = (req as any).trace;

  t.start('db-query');
  // Simulate database query
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.end('db-query');

  t.start('processing');
  // Simulate processing
  await new Promise((resolve) => setTimeout(resolve, 20));
  t.end('processing');

  res.json({ id: req.params.id, name: 'John Doe' });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Traces will be sent to: ${process.env.AI_RUNTIME_ENDPOINT || 'http://localhost:3000/api/v1/traces'}`);
});
