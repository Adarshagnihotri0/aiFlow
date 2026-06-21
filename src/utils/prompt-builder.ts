/**
 * Prompt Builder - Simple prompt assembly utility
 * 
 * Phase 1: Basic construction of prompts from components
 * Phase 2 (future): Accept policy parameter for route-based modification
 */

import type { ExecutionContext } from '../types/context';

export interface PromptComponent {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Simple prompt assembly function
 * 
 * @param components - Array of message components
 * @param context - Execution context for metadata
 * @returns Formatted messages array ready for Bedrock call
 */
export function buildPrompt(
  components: PromptComponent[],
  _context: ExecutionContext
): Array<{ role: string; content: string }> {
  // Log prompt construction
  const _totalLength = components.reduce((sum, c) => sum + c.content.length, 0);
  
  return components.map(component => ({
    role: component.role,
    content: component.content
  }));
}

/**
 * Extract existing messages from request body
 * Validates and normalizes message format
 */
export function extractMessages(body: Record<string, unknown>): PromptComponent[] {
  const messages = body['messages'];
  
  if (!Array.isArray(messages)) {
    return [];
  }
  
  return messages
    .filter((msg): msg is PromptComponent => {
      if (typeof msg !== 'object' || msg === null) {
        return false;
      }
      const m = msg as Record<string, unknown>;
      return (
        'role' in m && 
        'content' in m &&
        (m.role === 'system' || m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
      );
    });
}

/**
 * Create system prompt component
 */
export function createSystemPrompt(content: string): PromptComponent {
  return { role: 'system', content };
}

/**
 * Create user prompt component
 */
export function createUserPrompt(content: string): PromptComponent {
  return { role: 'user', content };
}

/**
 * Create assistant prompt component (for few-shot examples)
 */
export function createAssistantPrompt(content: string): PromptComponent {
  return { role: 'assistant', content };
}
