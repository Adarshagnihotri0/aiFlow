/**
 * HTTP Client - Sends traces to MCP Daemon endpoint
 */

import type { ExecutionTracePayload, SDKConfig } from './types';

/**
 * TraceClient - HTTP client for sending traces
 */
export class TraceClient {
  private endpoint: string;
  private timeout: number;
  private enabled: boolean;
  private silentErrors: boolean;

  constructor(config?: SDKConfig) {
    this.endpoint = config?.endpoint || 
                    process.env.AI_RUNTIME_ENDPOINT || 
                    'http://localhost:3000/api/v1/traces';
    this.timeout = config?.timeout || 5000;
    this.enabled = config?.enabled !== false;
    this.silentErrors = config?.silentErrors !== false;
  }

  /**
   * Send trace to MCP Daemon
   */
  async sendTrace(payload: ExecutionTracePayload): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      if (!this.silentErrors) {
        console.error('[MCP Trace SDK] Failed to send trace:', error);
      }
      return false;
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SDKConfig>): void {
    if (config.endpoint) this.endpoint = config.endpoint;
    if (config.timeout) this.timeout = config.timeout;
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.silentErrors !== undefined) this.silentErrors = config.silentErrors;
  }

  /**
   * Get current endpoint
   */
  getEndpoint(): string {
    return this.endpoint;
  }
}

/**
 * Default client instance
 */
let defaultClient: TraceClient | null = null;

export function getDefaultClient(config?: SDKConfig): TraceClient {
  if (!defaultClient) {
    defaultClient = new TraceClient(config);
  }
  return defaultClient;
}

export function setDefaultClient(client: TraceClient): void {
  defaultClient = client;
}
