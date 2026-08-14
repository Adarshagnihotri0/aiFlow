#!/bin/bash
set -euo pipefail

# Port 2999 is owned by com.adarsh.bedrock-proxy; use 2998 for local development.
echo "Starting development server on http://localhost:2998"
echo "Press Ctrl+C to stop"

PORT=2998 TELEGRAM_POLLING_ENABLED=false npm run dev
