#!/bin/bash
# Start dual-port proxy (2999 for VS Code, 3000 for OpenHands)

cd "$(dirname "$0")"

# Kill existing processes
echo "Cleaning up existing processes..."
pkill -f "nodemon.*2999" 2>/dev/null || true
pkill -f "nodemon.*3000" 2>/dev/null || true
lsof -ti :2999 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
sleep 2

# Start port 2999 (VS Code/GitHub Copilot) - Telegram enabled
echo "Starting port 2999 (VS Code)..."
PORT=2999 nohup npm run dev > ~/glm-proxy-2999.log 2>&1 &
PID_2999=$!
echo "  PID: $PID_2999"
sleep 3

# Start port 3000 (OpenHands) - Telegram disabled
echo "Starting port 3000 (OpenHands)..."
TELEGRAM_ENABLED=false PORT=3000 nohup npm run dev > ~/glm-proxy-3000.log 2>&1 &
PID_3000=$!
echo "  PID: $PID_3000"
sleep 3

# Verify both ports with timeout
echo ""
echo "=== Verifying Dual-Port Setup ==="

# Test port 2999 with 5s timeout
 perl -e 'alarm 5; exec @ARGV' -- curl -s http://localhost:2999/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "Port 2999: ✓ Running (VS Code/GitHub Copilot)"
else
    echo "Port 2999: ✗ FAILED"
    exit 1
fi

# Test port 3000 with 5s timeout
perl -e 'alarm 5; exec @ARGV' -- curl -s http://localhost:3000/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "Port 3000: ✓ Running (OpenHands)"
else
    echo "Port 3000: ✗ FAILED"
    exit 1
fi

echo ""
echo "✓ Both proxies running successfully"
echo "  - Port 2999: VS Code/GitHub Copilot (Telegram enabled)"
echo "  - Port 3000: OpenHands (Telegram disabled)"
echo ""
echo "PIDs saved to:"
echo "  ~/glm-proxy-2999.pid"
echo "  ~/glm-proxy-3000.pid"

# Save PIDs
echo $PID_2999 > ~/glm-proxy-2999.pid
echo $PID_3000 > ~/glm-proxy-3000.pid
