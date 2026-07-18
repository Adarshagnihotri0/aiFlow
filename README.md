# GLM Bedrock Proxy - MCP 1.0.0

A dual-port proxy server that enables multiple AI clients (VS Code/GitHub Copilot and OpenHands) to access GLM models through AWS Bedrock Mantle.

## What is This Repository?

This is a **Node.js/Express proxy server** that:
- Routes LLM requests to AWS Bedrock Mantle endpoint
- Provides OpenAI-compatible API endpoints
- Runs on **two ports simultaneously** to serve different clients
- Integrates with Graphiti memory system for persistent AI memory

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP 1.0.0 Proxy                           │
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐        │
│  │   Port 2999      │         │   Port 3000       │        │
│  │  (VS Code)       │         │  (OpenHands)      │        │
│  │                  │         │                   │        │
│  │ Telegram: ON     │         │ Telegram: OFF     │        │
│  │ Logs: 2999.log   │         │ Logs: 3000.log    │        │
│  │ PID: 2999.pid    │         │ PID: 3000.pid     │        │
│  └────────┬─────────┘         └────────┬──────────┘        │
│           │                             │                   │
│           └──────────┬──────────────────┘                  │
│                      │                                      │
│              ┌───────▼────────┐                             │
│              │ Express Server │                             │
│              │  src/index.ts  │                             │
│              └───────┬────────┘                             │
│                      │                                      │
│              ┌───────▼────────┐                             │
│              │ Bedrock Mantle  │                             │
│              │  (AWS API)      │                             │
│              └────────────────┘                             │
└─────────────────────────────────────────────────────────────┘

Integration:
┌─────────────────────────────────────────────────────────────┐
│  Port 2999                                                   │
│    └─> VS Code / GitHub Copilot                             │
│    └─> Runs in your current AI session                       │
│    └─> Telegram notifications enabled                       │
│                                                              │
│  Port 3000                                                   │
│    └─> OpenHands (~/.openhands/settings.json)               │
│    └─> Configured in settings.json with base_url            │
│    └─> Telegram disabled for stability                      │
└─────────────────────────────────────────────────────────────┘
```

## Why Two Ports?

Different AI clients need separate proxy instances:

1. **Port 2999 - VS Code/GitHub Copilot (You)**
   - Your current AI assistant (running this conversation)
   - Accessed via VS Code settings
   - Telegram notifications enabled for Claude Code responses
   - Can have background Telegram polling

2. **Port 3000 - OpenHands**
   - Separate AI agent (https://github.com/All-Hands-AI/OpenHands)
   - Configured in `~/.openhands/settings.json`
   - Telegram disabled to prevent connection issues
   - Runs independently

Both ports share the same proxy code and connect to the same Bedrock backend.

## Quick Start

### 1. Start Dual-Port Proxy
```bash
# Start both ports
cd ~/aiFlow/future/mcp1.0.0
./start-dual-ports.sh

# Or use the main AI startup script
~/start-ai.sh
```

### 2. Verify Both Ports
```bash
# Check health with 5s timeout
perl -e 'alarm 5; exec @ARGV' -- curl -s http://localhost:2999/health
perl -e 'alarm 5; exec @ARGV' -- curl -s http://localhost:3000/health
```
claude
```

**Cursor/Continue:** See [docs/DUAL_PORT_SETUP.md](docs/DUAL_PORT_SETUP.md) for detailed setup.

### 3. Test LLM Requests
```bash
# Test port 2999 (VS Code)
perl -e 'alarm 5; exec @ARGV' -- curl -s -X POST http://localhost:2999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"model": "zai.glm-5", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 10}'

# Test port 3000 (OpenHands)
perl -e 'alarm 5; exec @ARGV' -- curl -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"model": "zai.glm-5", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 10}'
```

## Integration Details

### VS Code / GitHub Copilot (Port 2999)

This port is used by your current VS Code AI assistant. It's automatically configured when you run VS Code with the proxy settings.

**Environment:**
```bash
ANTHROPIC_BASE_URL=http://localhost:2999
ANTHROPIC_API_KEY=dummy
```

**Status:**
- Runs in terminal session s020 (background)
- Process: Node.js ts-node
- Logs: `~/glm-proxy-2999.log`
- PID: `~/glm-proxy-2999.pid`

### OpenHands (Port 3000)

OpenHands is configured to use this port in its settings file.

**Configuration (`~/.openhands/settings.json`):**
```json
{
  "agent_settings": {
    "llm": {
      "model": "openai/zai.glm-5",
      "base_url": "http://localhost:3000/v1",
      "api_key": "test"
    }
  }
}
```

**Status:**
- Runs in terminal session s020 (background)
- Process: Node.js ts-node
- Logs: `~/glm-proxy-3000.log`
- PID: `~/glm-proxy-3000.pid`

## Memory System Integration

The proxy integrates with Graphiti memory system on startup:

```javascript
// src/index.ts - Automatic memory setup
try {
  const { autoSetup } = require('./scripts/memory-hook');
  autoSetup().catch(() => {}); // Silently fail if hook fails
} catch (error) {
  // Memory hook is optional
}
```

**Memory Components:**
- Neo4j Database: bolt://localhost:7687
- Graphiti Memory: ~/workspace/project/415bbbcd111a4a15ae5a9785d35276ef
- Auto-initialized when proxy starts

See the memory system repo: https://github.com/Adarshagnihotri0/openhands-graphiti-memory

## Process Management

### Check Running Processes
```bash
# View both ports
lsof -i :2999 -i :3000 | grep LISTEN

# View PIDs
cat ~/glm-proxy-2999.pid
cat ~/glm-proxy-3000.pid

# View processes
ps aux | grep "ts-node.*index.ts" | grep -v grep
```

### Stop Processes
```bash
# Kill by PID
kill $(cat ~/glm-proxy-2999.pid)
kill $(cat ~/glm-proxy-3000.pid)

# Or kill by port
lsof -ti :2999 | xargs kill -9
lsof -ti :3000 | xargs kill -9
```

### Restart
```bash
# Use the startup script
./start-dual-ports.sh
```

## Endpoints

Both ports expose identical endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/chat/completions` | POST | OpenAI-compatible chat |
| `/v1/messages` | POST | Anthropic-compatible messages |
| `/ready` | GET | Readiness probe |
| `/alive` | GET | Liveness probe |

## Environment Variables

### .env Configuration
```bash
# Port configuration
PORT=2999  # Default port (overridden by start-dual-ports.sh)

# Telegram notifications
TELEGRAM_ENABLED=true   # Port 2999
TELEGRAM_ENABLED=false  # Port 3000

# AWS Bedrock
BEDROCK_MANTLE_API_KEY=your_key_here
AWS_REGION=ap-south-1

# Database
DATABASE_URL="postgresql://user@localhost:5432/postgres"

# Redis cache
REDIS_URL=redis://localhost:6379
```

## Logs

```bash
# View port 2999 logs
tail -f ~/glm-proxy-2999.log

# View port 3000 logs
tail -f ~/glm-proxy-3000.log

# View all proxy logs
tail -f ~/glm-proxy.log
```

## Troubleshooting

### Port Already in Use
```bash
# Kill existing processes
lsof -ti :2999 | xargs kill -9
lsof -ti :3000 | xargs kill -9

# Restart
./start-dual-ports.sh
```

### Connection Timeout
All curl commands use 5s timeout:
```bash
perl -e 'alarm 5; exec @ARGV' -- curl -s http://localhost:2999/health
```

### OpenHands Can't Connect
1. Check port 3000 is running: `lsof -i :3000 | grep LISTEN`
2. Check OpenHands config: `cat ~/.openhands/settings.json | grep base_url`
3. Check logs: `tail -20 ~/glm-proxy-3000.log`

### Telegram Issues
- Port 2999: Telegram enabled (may show "Unreachable" if network issues)
- Port 3000: Telegram disabled (`TELEGRAM_ENABLED=false`)

## Development

### Start in Development Mode
```bash
# Single port (default 2999)
npm run dev

# Dual-port (recommended)
./start-dual-ports.sh
```

### Run Tests
```bash
npm test
```

### Build
```bash
npm run build
```

## Repository Structure

```
mcp1.0.0/
├── src/
│   ├── index.ts              # Main entry point (dual-port support)
│   ├── server.ts             # Express server setup
│   ├── bedrock.ts            # Bedrock API integration
│   └── scripts/
│       └── memory-hook.js    # Auto-setup memory on start
├── start-dual-ports.sh      # Dual-port startup script
├── DUAL_PORT_SETUP.md       # Setup documentation
├── README.md                 # This file
└── .env                      # Environment variables

Log Files (in ~/):
├── glm-proxy-2999.log        # Port 2999 logs
├── glm-proxy-3000.log        # Port 3000 logs
├── glm-proxy-2999.pid        # Port 2999 PID
└── glm-proxy-3000.pid        # Port 3000 PID
```

## Related Repositories

- **Memory System:** https://github.com/Adarshagnihotri0/openhands-graphiti-memory
  - Graphiti memory integration
  - Neo4j graph database
  - Port-agnostic configuration

- **OpenHands:** https://github.com/All-Hands-AI/OpenHands
  - Autonomous AI agent
  - Uses port 3000 for LLM calls

## License

MIT

## Support

For issues:
1. Check logs: `tail -f ~/glm-proxy-2999.log` or `tail -f ~/glm-proxy-3000.log`
2. Check processes: `lsof -i :2999 -i :3000 | grep LISTEN`
3. Restart: `./start-dual-ports.sh`
4. Check memory system: `cd ~/workspace/project/415bbbcd111a4a15ae5a9785d35276ef`


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
