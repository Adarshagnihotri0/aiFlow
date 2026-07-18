# Bedrock Proxy

**Use AI agents with AWS Bedrock.** Anthropic-compatible proxy that makes AWS Bedrock work with Claude Code, Cursor, Continue, and other AI tools.

---

## Quick Start

### 1. Setup

```bash
# Create .env file
cat > .env << EOF
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
PORT=3000
EOF

# Install and run
npm install
npm run dev
```

### 2. Configure Your AI Tool

**Claude Code:**
```bash
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=dummy
claude
```

**Cursor/Continue:** See [docs/DUAL_PORT_SETUP.md](docs/DUAL_PORT_SETUP.md) for detailed setup.

### 3. Test

```bash
curl http://localhost:3000/health
```

---

## Architecture

**Bedrock Proxy** - Express.js server providing:

- `/v1/messages` - Anthropic-compatible endpoint
- `/v1/chat/completions` - OpenAI-compatible endpoint  
- `/v1/models` - List available Bedrock models
- `/health` - Health check endpoint

### Components

```
bedrock-proxy/
├── src/
│   ├── index.ts           - Entry point
│   ├── server.ts          - Express router + endpoints
│   ├── bedrock.ts         - AWS Bedrock client
│   ├── adapters.ts        - Protocol translation
│   └── telegram-polling.ts - Optional notifications
├── scripts/
│   └── start-dual-ports.sh - Run on ports 2999 + 3000
└── docs/
    └── DUAL_PORT_SETUP.md  - Client configuration guide
```

---

## Features

✅ **Anthropic API compatibility** - Drop-in replacement for Claude API  
✅ **OpenAI API compatibility** - Works with tools expecting OpenAI format  
✅ **Dual port support** - Port 2999 (VS Code) + Port 3000 (OpenHands)  
✅ **Telegram notifications** - Optional progress updates  
✅ **PostgreSQL tracing** - Optional request logging

---

## Documentation

- [Quick Reference](docs/QUICK_REFERENCE.md) - Complete setup guide
- [Dual Port Setup](docs/DUAL_PORT_SETUP.md) - Multi-client configuration
- [Architecture](docs/ARCHITECTURE.md) - Technical details
- [Flow Diagram](docs/FLOW_DIAGRAM.md) - Request flow visualization

---

## Requirements

- Node.js 18+
- AWS account with Bedrock access
- (Optional) PostgreSQL for tracing
- (Optional) Redis for caching
- (Optional) Telegram bot for notifications

---

## License

MIT
