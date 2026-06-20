# @adarsh/ai-runtime

AI Runtime Intelligence - Lightweight observability SDK for AI systems.

## Installation

```bash
npm install @adarsh/ai-runtime
```

## Quick Start

### Using Namespace (Recommended)

```typescript
import { aiRuntime } from '@adarsh/ai-runtime';

// Manual tracing
const t = aiRuntime.trace('my-operation');
t.start('validation');
await validateInput(data);
t.end('validation');
t.start('processing');
await processData(data);
t.end('processing');
await aiRuntime.sendTrace(t.complete());

// Auto-tracing
const processOrder = aiRuntime.autoTrace('order-processing', async (order) => {
  const validated = await validateOrder(order);
  const processed = await processPayment(validated);
  return processed;
});

// Call normally - trace is created automatically
const result = await processOrder(orderData);
```

### Using Direct Imports

```typescript
import { trace, sendTrace } from '@adarsh/ai-runtime';

const t = trace('my-operation');
t.start('step');
await doWork();
t.end('step');
await sendTrace(t.complete());
```

## Configuration

### Environment Variables

```bash
export AI_RUNTIME_ENDPOINT=http://localhost:3000/api/v1/traces
```

### Programmatic Configuration

```typescript
import { aiRuntime } from '@adarsh/ai-runtime';

aiRuntime.configure({
  endpoint: 'https://your-daemon.com/api/v1/traces',
  timeout: 5000,
  silentErrors: true,
  enabled: true
});

// Or check current config
const config = aiRuntime.getConfig();
console.log(config.endpoint);
```

## API Reference

### `aiRuntime.trace(route, trace_id?, metadata?)`

Create a manual trace.

- `route` - Route name for this trace
- `trace_id` - Optional trace ID (auto-generated if not provided)
- `metadata` - Optional metadata to attach

Returns: `TraceBuilder` instance

### `aiRuntime.autoTrace(route, fn)`

Wrap a function with automatic tracing.

- `route` - Route name
- `fn` - Function to wrap

Returns: Wrapped function with tracing

### `aiRuntime.configure(config)`

Configure SDK globally.

- `config.endpoint` - AI Runtime daemon URL (default: `http://localhost:3000/api/v1/traces`)
- `config.timeout` - Request timeout in ms (default: 5000)
- `config.silentErrors` - Suppress error logging (default: true)
- `config.enabled` - Enable/disable tracing (default: true)

## Trace Structure

Each trace contains:

```typescript
{
  trace_id: string;
  route: string;
  stages: Array<{
    name: string;
    start_time: number;
    end_time: number;
    duration_ms: number;
  }>;
  total_ms: number;
  status: 'success' | 'error' | 'timeout';
  error_message?: string;
  metadata?: Record<string, unknown>;
}
```

## Error Handling

The SDK fails silently by default and won't break your application:

```typescript
// Enable error logging for debugging
aiRuntime.configure({ silentErrors: false });
```

## Examples

### Express Middleware

```typescript
import { aiRuntime } from '@adarsh/ai-runtime';
import express from 'express';

const app = express();

app.use(async (req, res, next) => {
  const t = aiRuntime.trace('http-request', req.id, {
    method: req.method,
    path: req.path
  });
  
  req.trace = t;
  
  res.on('finish', async () => {
    if (res.statusCode >= 400) {
      t.setError(`HTTP ${res.statusCode}`);
    }
    await aiRuntime.sendTrace(t.complete());
  });
  
  next();
});
```

### Background Jobs

```typescript
import { aiRuntime } from '@adarsh/ai-runtime';

const processJob = aiRuntime.autoTrace('job-processing', async (job) => {
  const result = await doWork(job.data);
  return result;
});

// Worker
worker.on('job', async (job) => {
  await processJob(job);
});
```

### DatabaiRuntime } from '@adarsh/ai-runtime';

async function queryWithTrace(sql: string, params: any[]) {
  const t = aiRuntime.trace('db-query', undefined, { query: sql });
  
  t.start('connection');
  const conn = await pool.connect();
  t.end('connection');
  
  t.start('query');
  try {
    const result = await conn.query(sql, params);
    t.end('query');
    await aiRuntime.sendTrace(t.complete());
    return result;
  } catch (error) {
    t.setError(error.message);
    t.end('query');
    await aiRuntime.sendTrace(t.complete()
    t.setError(error.message);
    t.end('query');
    await t.complete();
    throw error;
  } finally {
    conn.release();
  }
}
```

## License

MIT
