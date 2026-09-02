/**
 * Thin client for the platform's runner protocol. The agent talks HTTP to the
 * API only — never a database, never the KEK (see docs/backend-plan.md §8).
 */
class ApiClient {
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  async #request(method, path, body) {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 204) return { status: 204, body: null };

    const text = await res.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const message = parsed?.error?.message || parsed || res.statusText;
      const err = new Error(`${method} ${path} -> ${res.status}: ${message}`);
      err.status = res.status;
      throw err;
    }
    return { status: res.status, body: parsed };
  }

  heartbeat({ status = 'online', capacity = 1 } = {}) {
    return this.#request('POST', '/runners/heartbeat', { status, capacity });
  }

  /** Returns a job, or null when the queue is empty for these modes. */
  async claim(modes) {
    const { status, body } = await this.#request('POST', '/runners/claim', { modes });
    return status === 204 ? null : body.job;
  }

  /** Posts a batch of per-request results; returns whether the run was canceled. */
  async postEvents(runId, results) {
    const { body } = await this.#request('POST', `/runs/${runId}/events`, { results });
    return Boolean(body?.cancelRequested);
  }

  complete(runId, { status, summary, artifacts }) {
    return this.#request('POST', `/runs/${runId}/complete`, { status, summary, artifacts });
  }
}

module.exports = { ApiClient };
