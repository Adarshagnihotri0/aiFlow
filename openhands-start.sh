#!/bin/bash
# Start Bedrock Proxy + OpenHands Agent Canvas

PROXY_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 1. Start Bedrock proxy if not already running ─────────────────────────────
if pgrep -f "ts-node.*src/index.ts" > /dev/null; then
  echo "✅ Bedrock proxy already running on http://localhost:3000"
else
  echo "Starting Bedrock proxy..."
  cd "$PROXY_DIR"
  nohup node --experimental-specifier-resolution=node node_modules/.bin/ts-node src/index.ts \
    > /tmp/bedrock-proxy.log 2>&1 &
  sleep 2

  if pgrep -f "ts-node.*src/index.ts" > /dev/null; then
    echo "✅ Bedrock proxy started on http://localhost:3000"
  else
    echo "❌ Proxy failed to start. Check logs: tail -f /tmp/bedrock-proxy.log"
    exit 1
  fi
fi

# ── 2. Verify proxy is responding ─────────────────────────────────────────────
for i in 1 2 3; do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Proxy health check passed"
    break
  fi
  sleep 1
done

# ── 3. Start OpenHands Agent Canvas ───────────────────────────────────────────
echo ""
echo "Starting OpenHands Agent Canvas..."
echo "  UI: http://localhost:8000"
echo "  LLM backend: http://localhost:3000/v1 (Bedrock proxy → zai.glm-5)"
echo ""

agent-canvas
