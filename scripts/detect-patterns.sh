#!/bin/bash

# Pattern Detection Script
# Run weekly to extract patterns from git history

echo "Pattern Detection Report"
echo "========================"
echo "Date: $(date +%Y-%m-%d)"
echo ""

# Output directory
OUTPUT_DIR=".ai/auto"
mkdir -p "$OUTPUT_DIR"

echo "## Hotspots (most changed files)" > "$OUTPUT_DIR/patterns-report.md"
echo "" >> "$OUTPUT_DIR/patterns-report.md"
git log --since="1 month ago" --name-only --pretty=format: | \
  sort | uniq -c | sort -nr | head -10 >> "$OUTPUT_DIR/patterns-report.md"

echo "" >> "$OUTPUT_DIR/patterns-report.md"
echo "## Repeated Patterns" >> "$OUTPUT_DIR/patterns-report.md"
echo "" >> "$OUTPUT_DIR/patterns-report.md"
git log --since="1 month ago" --grep="feat:" --oneline | \
  awk '{print $2}' | sort | uniq -c | sort -nr | head -5 >> "$OUTPUT_DIR/patterns-report.md"

echo "" >> "$OUTPUT_DIR/patterns-report.md"
echo "## Bug-prone Files" >> "$OUTPUT_DIR/patterns-report.md"
echo "" >> "$OUTPUT_DIR/patterns-report.md"
git log --since="1 month ago" --grep="fix:" --name-only | \
  sort | uniq -c | sort -nr | head -10 >> "$OUTPUT_DIR/patterns-report.md"

echo "✓ Pattern report generated: $OUTPUT_DIR/patterns-report.md"
