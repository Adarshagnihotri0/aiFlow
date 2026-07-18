#!/bin/bash
#
# Enhanced dev script for mcp1.0.0
# Automatically starts memory system when you run npm run dev
#

set -e

echo "════════════════════════════════════════════════════════════"
echo "  Starting Bedrock Proxy + Memory System"
echo "════════════════════════════════════════════════════════════"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MCP_DIR="$(dirname "$SCRIPT_DIR")"
MEMORY_DIR="/Users/adarshagnihotri/workspace/project/415bbbcd111a4a15ae5a9785d35276ef"

cd "$MCP_DIR"

# ── 1. Start Neo4j for Memory System ──────────────────────────────────────────
echo "[1/2] Starting Neo4j for Memory System..."
if ! docker ps | grep -q openhands-memory; then
    docker run -d --name openhands-memory -p 7474:7474 -p 7687:7687 \
        -e NEO4J_AUTH=neo4j/test1234 neo4j:latest > /dev/null 2>&1 || true
    sleep 5
    echo "  ✓ Neo4j ready on bolt://localhost:7687"
else
    echo "  ✓ Neo4j already running"
fi

# ── 2. Set environment variables ─────────────────────────────────────────────
echo "[2/2] Setting environment variables..."

# Load .env from mcp1.0.0
if [ -f "$MCP_DIR/.env" ]; then
    export $(grep -v '^#' "$MCP_DIR/.env" | xargs)
fi

# Set memory system specific variables
export BEDROCK_PROXY_URL="http://localhost:3000"
export BEDROCK_MODEL="${BEDROCK_MODEL:-anthropic.claude-3-5-sonnet}"
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="test1234"

echo "  ✓ BEDROCK_PROXY_URL=$BEDROCK_PROXY_URL"
echo "  ✓ BEDROCK_MODEL=$BEDROCK_MODEL"
echo "  ✓ NEO4J_URI=$NEO4J_URI"
echo ""

# ── 3. Start the proxy ───────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════"
echo "  Starting Bedrock Proxy (npm run dev)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Run the original npm run dev
npm run dev
