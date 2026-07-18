#!/bin/bash
# Check Bedrock Proxy status

if pgrep -f "ts-node.*src/index.ts" > /dev/null; then
    PID=$(pgrep -f "ts-node.*src/index.ts")
    echo "✅ Bedrock Proxy is RUNNING (PID: $PID)"
    echo ""
    echo "📍 URL: http://localhost:3000"
    echo "📝 Logs: tail -f /tmp/bedrock-proxy.log"
    echo ""
    
    # Show last 5 log lines
    echo "Last 5 log entries:"
    echo "---"
    tail -5 /tmp/bedrock-proxy.log 2>/dev/null || echo "(no logs yet)"
else
    echo "❌ Bedrock Proxy is STOPPED"
    echo ""
    echo "To start: ./proxy-start.sh"
fi
