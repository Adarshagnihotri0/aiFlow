# Dual-Port Proxy Setup

The proxy can serve two clients through separately managed processes:

- **Port 2999**: VS Code / GitHub Copilot, owned exclusively by `com.adarsh.bedrock-proxy`
- **Port 3000**: OpenHands, started independently with Telegram disabled

## Quick Start

```bash
# Recover the launchd service on 2999 and start 3000 only when needed.
./start-dual-ports.sh
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
# Launchd-managed port 2999
ai2 status
ai2 logs

# Independently managed port 3000
tail -f ~/glm-proxy-3000.log
cat ~/glm-proxy-3000.pid
```

## Troubleshooting

### Port already in use
```bash
# Never kill port 2999 directly; inspect or restart its owner.
ai2 status
ai2 restart

# Inspect port 3000 before starting it.
lsof -nP -iTCP:3000 -sTCP:LISTEN
./start-dual-ports.sh
```

### Telegram interference
- Port 2999: Telegram behavior is configured by its LaunchAgent environment.
- Port 3000: `TELEGRAM_ENABLED`, `TELEGRAM_POLLING_ENABLED`, and `TELEGRAM_FORWARD_CHATS` are set to `false` by the launcher.

### Health check fails
```bash
ai2 status
curl -fsS http://127.0.0.1:2999/health
curl -fsS http://127.0.0.1:3000/health
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

The proxy is stateless and does not start Graphiti, Neo4j, Docker, or other memory infrastructure. Any future memory adapter must run as a separately managed service and expose explicit operations.
