#!/bin/bash
# Script to run dev server with notification on completion

echo "Starting development server..."
echo "Press Ctrl+C to stop (you'll hear a notification sound)"

# Trap exit to play sound on any termination
trap 'afplay /System/Library/Sounds/Glass.aiff' EXIT

# Run the dev server
npm run dev
