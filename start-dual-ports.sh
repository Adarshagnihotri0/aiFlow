#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v ai2 >/dev/null 2>&1; then
  echo "ai2 is required to manage the launchd-owned port 2999 proxy."
  exit 1
fi

ai2 start

if curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null 2>&1; then
  echo "Port 3000: already healthy (OpenHands)"
else
  if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port 3000 is occupied by a process that is not serving the proxy health endpoint."
    exit 1
  fi

  echo "Starting port 3000 (OpenHands, Telegram disabled)..."
  TELEGRAM_ENABLED=false TELEGRAM_POLLING_ENABLED=false TELEGRAM_FORWARD_CHATS=false PORT=3000 \
    nohup npm run dev > "$HOME/glm-proxy-3000.log" 2>&1 &
  pid_3000=$!
  echo "$pid_3000" > "$HOME/glm-proxy-3000.pid"

  for _attempt in 1 2 3 4 5; do
    if curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null 2>&1; then
      break
    fi
    /bin/sleep 1
  done
fi

curl -fsS --max-time 5 http://127.0.0.1:2999/health >/dev/null
curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null

echo "Port 2999: healthy and managed by com.adarsh.bedrock-proxy"
echo "Port 3000: healthy and independently managed for OpenHands"
