/** Same-origin only; never cache private responses or persist conversation content. */
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request(path, { method = 'GET', body, signal } = {}) {
  if (!path.startsWith('/api/') || path.includes('://')) throw new ApiError('Invalid API path.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 60000);
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    if (response.status === 204 && response.ok) return {};
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(typeof data?.error === 'string' ? data.error : `Request failed (${response.status}). Please try again.`, response.status);
    if (!data || typeof data !== 'object') throw new ApiError('The server returned an unreadable response. Please retry.');
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('The request was interrupted or timed out. Its outcome may be unknown. Retry when ready.');
    throw new ApiError('Could not reach Fieldnotes. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}