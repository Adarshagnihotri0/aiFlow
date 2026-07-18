#!/bin/bash
# Stop Bedrock Proxy

echo "Stopping Bedrock Proxy..."

# Kill the process
pkill -f "ts-node.*src/index.ts" 

# Wait a moment
sleep 1

# Verify it's stopped
if pgrep -f "ts-node.*src/index.ts" > /dev/null; then
    echo "⚠️  Still running, force kill..."
    pkill -9 -f "ts-node.*src/index.ts"
    sleep 1
fi

# Check final status
if pgrep -f "ts-node.*src/index.ts" > /dev/null; then
    echo "❌ Failed to stop"
else
    echo "✅ Stopped successfully"
fi
