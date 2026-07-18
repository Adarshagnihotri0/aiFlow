# MCP 1.0.0 - Quick Reference Guide

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Create .env file
cat > .env << EOF
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
PORT=3000
EOF

# Install dependencies
npm install

# Run development server
npm run dev

# Or build and run production
npm run build && npm start
```

### 2. Configure Claude Code

```bash
# Set Claude Code to use the proxy
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=dummy

# Start Claude Code
claude
```

### 3. Test the Proxy

```bash
# Health check
curl http://localhost:3000/health

# List models
curl http://localhost:3000/v1/models

# Send a test message
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: dummy" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## 📁 Project Structure

```
mcp1.0.0/
├── src/
│   ├── index.ts           # Entry point, starts server
│   ├── server.ts          # Express app, route handlers
│   ├── bedrock.ts         # Bedrock SDK client, streaming
│   └── adapters.ts        # Protocol translation logic
├── docs/
│   ├── ARCHITECTURE.md              # Architecture overview
│   ├── TECHNICAL_DETAILS.md         # Complete technical spec
│   ├── FLOW_DIAGRAM.md              # Request/response flows
│   ├── QUICK_REFERENCE.md           # This file
│   └── DUAL_PORT_SETUP.md           # Client configuration
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── .env                   # Environment variables
```

---

## 🔧 Core Files Explained

### `index.ts` - Server Bootstrap
```typescript
1. Load environment variables (dotenv)
2. Import Express app
3. Listen on PORT (default 3000)
4. Print setup instructions
```

### `server.ts` - HTTP Router
```typescript
Endpoints:
- GET  /health               → {"status": "ok"}
- GET  /v1/models           → List available models
- POST /v1/messages          → Anthropic Messages API
- POST /v1/chat/completions  → OpenAI Chat Completions
- POST /v1/completions       → Legacy OpenAI API

Features:
- 10MB JSON body limit
- Request logging
- Error handling
- Stream detection
```

### `bedrock.ts` - AWS Client
```typescript
Functions:
- invokeModel()              → Non-streaming Anthropic
- invokeModelStream()        → Streaming Anthropic
- invokeModelOpenAI()        → Non-streaming OpenAI
- invokeModelStreamOpenAI()  → Streaming OpenAI

Bedrock APIs:
- ConverseCommand           → Single response
- ConverseStreamCommand     → SSE stream

SSE Formatting:
- event: message_start
- event: content_block_start
- event: content_block_delta
- event: content_block_stop
- event: message_delta
- event: message_stop
```

### `adapters.ts` - Protocol Converter
```typescript
Anthropic → Bedrock:
- toConverseInput()         → Request transformation
- toConverseContent()       → Content block mapping

Bedrock → Anthropic:
- fromConverseResponse()    → Response transformation

OpenAI ↔ Bedrock:
- openaiToConverseInput()   → OpenAI → Bedrock
- fromConverseResponseOpenAI() → Bedrock → OpenAI

Model Configuration:
- STATIC_MODEL_ID = 'zai.glm-5' (current)
- Region-based prefix logic
- Max tokens: 1,640,000 (Nova), 5,000 (OpenAI)
```

---

## 🌐 API Endpoints

### Anthropic Messages API

**Endpoint**: `POST /v1/messages`

**Request**:
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "temperature": 0.7,
  "system": "You are a helpful assistant.",
  "messages": [
    {"role": "user", "content": "Hello!"},
    {"role": "assistant", "content": "Hi there!"},
    {"role": "user", "content": "How are you?"}
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get weather",
      "input_schema": {"type": "object", "properties": {...}}
    }
  ],
  "stream": false
}
```

**Response**:
```json
{
  "id": "msg_1234567890",
  "type": "message",
  "role": "assistant",
  "content": [
    {"type": "text", "text": "I'm doing well!"}
  ],
  "model": "zai.glm-5",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 15,
    "output_tokens": 10
  }
}
```

---

### OpenAI Chat Completions API

**Endpoint**: `POST /v1/chat/completions`

**Request**:
```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1024,
  "temperature": 0.7,
  "stream": false
}
```

**Response**:
```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1718867890,
  "model": "amazon-nova-micro",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 10,
    "total_tokens": 25
  }
}
```

---

## 🔄 Streaming Examples

### Anthropic Streaming

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: dummy" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Count to 10"}],
    "stream": true
  }'
```

**Output** (SSE):
```
event: message_start
data: {"type": "message_start", "message": {...}}

event: content_block_start
data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "1, "}}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "2, "}}

...

event: content_block_stop
data: {"type": "content_block_stop", "index": 0}

event: message_delta
data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 50}}

event: message_stop
data: {"type": "message_stop"}
```

### OpenAI Streaming

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

**Output**:
```
data: {"id": "chatcmpl-...", "object": "chat.completion.chunk", "choices": [{"delta": {"role": "assistant"}, "index": 0}]}

data: {"id": "chatcmpl-...", "object": "chat.completion.chunk", "choices": [{"delta": {"content": "Hello"}, "index": 0}]}

data: {"id": "chatcmpl-...", "object": "chat.completion.chunk", "choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}

data: [DONE]
```

---

## 🛡️ Error Handling

### Error Types

**1. Bedrock Error (500)**
```json
{
  "type": "error",
  "error": {
    "type": "bedrock_error",
    "message": "Model not found: zai.glm-5"
  }
}
```

**2. Conversion Error (400)**
```json
{
  "type": "error",
  "error": {
    "type": "conversion_error",
    "message": "Invalid tool_result format"
  }
}
```

**3. Missing Parameters (400)**
```json
{
  "type": "error",
  "error": {
    "type": "invalid_request",
    "message": "Missing required field: messages"
  }
}
```

---

## 🔍 Debugging

### Enable Verbose Logging

Modify `server.ts`:
```typescript
console.log('Request body:', JSON.stringify(body, null, 2));
console.log('Bedrock input:', JSON.stringify(input, null, 2));
console.log('Bedrock response:', JSON.stringify(response, null, 2));
```

### Check Bedrock Response

Modify `bedrock.ts`:
```typescript
console.log('Converse response:', JSON.stringify(response, null, 2));
```

### Monitor Streaming

```typescript
// In bedrock.ts invokeModelStream()
console.log('Stream event:', JSON.stringify(event, null, 2));
```

---

## 📊 Monitoring

### Health Check Endpoint

```bash
curl http://localhost:3000/health
# → {"status": "ok"}
```

### Metrics to Track

```typescript
// Add to server.ts
let requestCount = 0;
let errorCount = 0;

app.use((req, res, next) => {
  requestCount++;
  res.on('finish', () => {
    if (res.statusCode >= 400) errorCount++;
  });
  next();
});

app.get('/metrics', (_req, res) => {
  res.json({
    requests: requestCount,
    errors: errorCount,
    uptime: process.uptime()
  });
});
```

---

## 🔐 Security Best Practices

### Production Checklist

- [ ] Add TLS/SSL (HTTPS)
- [ ] Implement API key validation
- [ ] Add rate limiting
- [ ] Enable request logging
- [ ] Set up IP whitelisting
- [ ] Configure CORS policies
- [ ] Implement request signing
- [ ] Add audit logging

### Environment Variables

```bash
# Never commit .env file
echo ".env" >> .gitignore

# Use AWS IAM roles in production
# Avoid hardcoded credentials

# Rotate credentials regularly
# Use short-lived session tokens
```

---

## 🚨 Troubleshooting

### Common Issues

**Issue**: Connection refused
```bash
# Check if server is running
lsof -i :3000
# Or
netstat -an | grep 3000

# Restart server
npm run dev
```

**Issue**: AWS credentials error
```bash
# Verify environment variables
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY

# Test AWS CLI
aws sts get-caller-identity
```

**Issue**: Model not found
```bash
# Check Bedrock model access
aws bedrock list-foundation-models --region us-east-1

# Verify model ID in adapters.ts
grep STATIC_MODEL_ID src/adapters.ts
```

**Issue**: Streaming not working
```bash
# Check Content-Type header
curl -v http://localhost:3000/v1/messages | grep "Content-Type"

# Should be: text/event-stream for streaming
```

---

## 📈 Performance Tuning

### Increase Throughput

```typescript
// In server.ts
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const cpuCount = os.cpus().length;
  for (let i = 0; i < cpuCount; i++) {
    cluster.fork();
  }
} else {
  // Start Express server
  app.listen(PORT);
}
```

### Optimize Memory

```typescript
// Increase Node memory limit
node --max-old-space-size=4096 dist/index.js
```

### Enable Compression

```bash
npm install compression
```

```typescript
// In server.ts
import compression from 'compression';
app.use(compression());
```

---

## 🔗 Integration Examples

### With LangChain

```python
from langchain.chat_models import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:3000/v1",
    api_key="dummy",
    model="gpt-4"
)

response = llm.invoke("Hello!")
```

### With Python SDK

```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:3000",
    api_key="dummy"
)

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
```

---

## 📝 Cheat Sheet

| Task | Command |
|------|---------|
| Start dev server | `npm run dev` |
| Build for production | `npm run build` |
| Run production | `npm start` |
| Test health | `curl localhost:3000/health` |
| List models | `curl localhost:3000/v1/models` |
| View logs | `tail -f /var/log/mcp.log` |
| Check process | `ps aux | grep node` |
| Kill process | `kill -9 <PID>` |

---

## 🎯 Summary

**What MCP 1.0.0 Does**:
✅ Bridges Claude Code ↔ AWS Bedrock  
✅ Translates Anthropic ↔ OpenAI APIs  
✅ Streams responses in real-time  
✅ Handles tool calling seamlessly  
✅ Runs with zero code changes  

**How to Use**:
1. Set environment variables (AWS credentials)
2. Run `npm run dev`
3. Configure Claude Code to use `http://localhost:3000`
4. Enjoy using Bedrock models through Claude Code!

**Architecture**:
- **3 core files** (index, server, bedrock, adapters)
- **~400 lines of code**
- **Stateless** architecture
- **Horizontally scalable**
- **Zero external dependencies** (except AWS SDK)

---

**Last Updated**: June 20, 2026  
**Version**: 1.0.0  
**Maintained by**: Future Development Team
