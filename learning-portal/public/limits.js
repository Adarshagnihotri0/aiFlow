// Shared wire limits: browser payloads must remain valid for the server schema.
export const limits = Object.freeze({ question: 2000, history: 8, historyEntry: 4000, jobDescription: 12000 });
export function boundedHistory(messages) {
  return messages.slice(-limits.history).map(({ role, content }) => ({ role, content: content.slice(0, limits.historyEntry) }));
}