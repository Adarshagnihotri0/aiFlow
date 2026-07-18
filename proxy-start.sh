#!/bin/bash
# Start Bedrock Proxy as lightweight background process

cd /Users/adarshagnihotri/aiFlow/future/mcp1.0.0

# Check if already running
if pgrep -f "ts-node.*src/index.ts" > /dev/null; then
    echo "⚠️  Proxy already running"
    echo "To stop it: ./proxy-stop.sh"
    exit 0
fi

# Start in background
nohup node --experimental-specifier-resolution=node node_modules/.bin/ts-node src/index.ts > /tmp/bedrock-proxy.log 2>&1 &

echo "✅ Bedrock Proxy started"
echo "📍 Running on http://localhost:3000"
echo "📝 Logs: tail -f /tmp/bedrock-proxy.log"
echo ""
echo "To stop: ./proxy-stop.sh"
