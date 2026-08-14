# GLM Bedrock Proxy - MCP 1.0.0

A multi-provider protocol proxy for VS Code and OpenHands. The production port 2999 process is owned by launchd; the optional port 3000 process is managed independently for OpenHands.

## What is This Repository?

This is a **Node.js/Express proxy server** that:
- Routes Azure/SOL aliases to Azure, OpenRouter aliases to OpenRouter, and other requests to Bedrock/Mantle
- Provides Anthropic- and OpenAI-compatible API endpoints
- Supports separate managed instances for VS Code on port 2999 and OpenHands on port 3000
- Provides curated repository knowledge for coding agents; Graphiti is not connected to proxy runtime

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
# Ensure launchd-owned port 2999 is healthy and start port 3000 if needed
cd ~/aiFlow/future/mcp1.0.0
./start-dual-ports.sh
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
- Owner: user LaunchAgent `com.adarsh.bedrock-proxy`
- Status and lifecycle: `ai2 status`, `ai2 start`, `ai2 restart`
- Logs: `ai2 logs`

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
- Managed independently from the port-2999 LaunchAgent
- Started by `./start-dual-ports.sh` when its health endpoint is unavailable
- Logs: `~/glm-proxy-3000.log`
- PID record: `~/glm-proxy-3000.pid`

## Agent Memory

The proxy remains a stateless protocol gateway. It does not start Neo4j or Graphiti.

Coding agents use curated, repository-scoped context instead:

- `.github/agent-knowledge/PROXY_INDEX.json` is the retrieval entry point.
- `.github/agent-knowledge/proxy-runtime.json` contains verified runtime facts and provenance.
- `.github/copilot-instructions.md` defines retrieval and safe-write rules.
- `.github/agents/ai2-coordinator.agent.md` provides the project-specific implementation workflow.

A future Graphiti integration should be a separately managed service exposing explicit `search` and `remember` operations. It must not start from `src/index.ts` or store credentials, full prompts, or full model responses.

## Process Management

Port 2999 has one owner: the user LaunchAgent `com.adarsh.bedrock-proxy`. Use `ai2` instead of starting or killing `ts-node` directly:

```bash
ai2                 # Same as ai2 status; does not restart a healthy proxy
ai2 start           # Load or recover the LaunchAgent when needed
ai2 restart         # Explicitly replace the managed process
ai2 logs            # Show recent launchd stdout and stderr
ai2 agent           # Open this repository and show the coordinator workflow
ai2 help
```

Every health-bearing command verifies that the listener PID belongs to launchd. `ai2` does not start OpenHands, port 3000, Neo4j, Graphiti, or Docker.

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

The port-2999 LaunchAgent sets `PORT=2999` explicitly. Other launch modes may use `.env`:

```bash
# Outbound proxy chat forwarding to the private Telegram group
TELEGRAM_FORWARD_CHATS=true
TELEGRAM_CHAT_ID=-1004386786627
TELEGRAM_BOT_TOKEN=enter_a_newly_rotated_token_locally

# Streaming responses update one Telegram message in safe batches.
# Telegram enforces rate limits, so values below 750 ms are clamped.
TELEGRAM_STREAM_UPDATE_MS=1000

# Forwarded Markdown is rendered with Telegram HTML formatting. Headings,
# emphasis, links, lists, quotations, and code are supported; unsafe HTML is escaped.
# Telegram sends/edits do not invoke a model or consume additional LLM tokens.

# The user-level VS Code Stop hook creates one forum topic lazily per workspace.
# Grant the bot Manage Topics in the group's Administrators settings to enable it.
# Until then, workspace responses continue to arrive in the General topic.
# Topic names and thread IDs are cached privately in ~/.copilot/telegram-workspace-topics.json.

# Optional inbound Telegram bot chat. The port-2999 LaunchAgent enables this
# explicitly; other launch modes can opt in through their environment.
TELEGRAM_POLLING_ENABLED=true

# In a workspace forum topic, use /ask <message> to talk to GLM-5.
# Owner-only project control uses /work <request> to create a read-only plan,
# then /confirm <token> within 10 minutes to permit file edits in that same
# mapped workspace. /cancel <token> discards a plan. /check build runs the
# workspace's fixed, administrator-provisioned validator without a shell.
# /clear, /history, /status, and /help remain topic-scoped chat commands.
# Arbitrary shell commands are intentionally unavailable from Telegram.
# Workspace roots and checks are configured privately in
# ~/.copilot/telegram-workspace-topics.json (mode 600).

# Provider credentials
OPENROUTER_API_KEY=your_openrouter_key_here
BEDROCK_MANTLE_API_KEY=your_key_here
AWS_REGION=ap-south-1

# Database
DATABASE_URL="postgresql://user@localhost:5432/postgres"

# Redis cache
REDIS_URL=redis://localhost:6379
```

## Logs

```bash
# View launchd-managed port 2999 stdout and stderr
ai2 logs

# View independently managed port 3000 logs
tail -f ~/glm-proxy-3000.log
```

## Troubleshooting

### Port Already in Use
```bash
# Port 2999 must remain owned by launchd.
ai2 status
ai2 restart

# Inspect port 3000 without killing unrelated processes.
lsof -nP -iTCP:3000 -sTCP:LISTEN
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
# Isolated development instance; does not compete with launchd on port 2999.
PORT=2998 TELEGRAM_POLLING_ENABLED=false npm run dev

# Ensure the managed 2999 and optional OpenHands 3000 instances are healthy.
./start-dual-ports.sh
```

### Validate
```bash
npm run build
curl -fsS http://127.0.0.1:2999/health
```

## Repository Structure

```
mcp1.0.0/
├── src/
│   ├── index.ts              # Main entry point
│   ├── server.ts             # Express server setup and routing
│   └── bedrock.ts            # Bedrock API integration
├── .github/
│   ├── copilot-instructions.md
│   ├── agents/
│   │   └── ai2-coordinator.agent.md
│   └── agent-knowledge/
│       ├── PROXY_INDEX.json
│       └── proxy-runtime.json
├── start-dual-ports.sh
├── docs/
├── README.md
└── .env
```

## Related Repositories

- **Historical memory experiment:** https://github.com/Adarshagnihotri0/openhands-graphiti-memory
  - Not connected to this proxy runtime
  - Requires a separate, explicit adapter before it can provide agent memory

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
4. Check agent context: `.github/agent-knowledge/PROXY_INDEX.json`
