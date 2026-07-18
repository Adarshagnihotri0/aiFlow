# Dual-Port Proxy Setup

This proxy runs on **two ports simultaneously** to serve different clients:

- **Port 2999**: VS Code / GitHub Copilot (Telegram notifications enabled)
- **Port 3000**: OpenHands (Telegram disabled for stability)

## Quick Start

```bash
# Start both ports
./start-dual-ports.sh

# Or use the main AI startup script
~/start-ai.sh
```

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Port 2999     │         │   Port 3000      │
│  (VS Code)      │         │  (OpenHands)     │
│  Telegram: ON   │         │  Telegram: OFF   │
└────────┬────────┘         └────────┬─────────┘
         │                            │
         └──────────┬─────────────────┘
                    │
            ┌───────▼────────┐
            │  Bedrock API   │
            │  (via Mantle)  │
            └────────────────┘
```

## Testing

```bash
# Test port 2999 (5s timeout)
perl -e 'alarm 5; exec @ARGV' -- curl -s -X POST http://localhost:2999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"model": "zai.glm-5", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 10}'

# Test port 3000 (5s timeout)
perl -e 'alarm 5; exec @ARGV' -- curl -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"model": "zai.glm-5", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 10}'
```

## Logs

```bash
# View logs
tail -f ~/glm-proxy-2999.log
tail -f ~/glm-proxy-3000.log

# Check PIDs
cat ~/glm-proxy-2999.pid
cat ~/glm-proxy-3000.pid
```

## Troubleshooting

### Port already in use
```bash
# Kill processes on both ports
lsof -ti :2999 | xargs kill -9
lsof -ti :3000 | xargs kill -9

# Restart
./start-dual-ports.sh
```

### Telegram interference
- Port 2999: Uses `TELEGRAM_ENABLED=true` (from .env)
- Port 3000: Uses `TELEGRAM_ENABLED=false` (set explicitly)

### Health check fails
```bash
# Check if processes are running
ps aux | grep "ts-node.*index.ts"

# Check if ports are listening
lsof -i :2999 -i :3000 | grep LISTEN
```

## Client Configuration

### VS Code / GitHub Copilot
Set in your environment or settings:
```
ANTHROPIC_BASE_URL=http://localhost:2999
ANTHROPIC_API_KEY=dummy
```

### OpenHands
Configured in `~/.openhands/settings.json`:
```json
{
  "llm": {
    "base_url": "http://localhost:3000/v1",
    "model": "openai/zai.glm-5"
  }
}
```

## Integration with Memory System

Both ports integrate with the Graphiti memory system:
- Neo4j: bolt://localhost:7687
- Memory auto-initialized on startup via `memory-hook.js`

See `/Users/adarshagnihotri/start-ai.sh` for full stack startup.
