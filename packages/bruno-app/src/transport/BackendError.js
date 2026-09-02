/**
 * Error thrown by BackendClient for any non-2xx response or transport failure.
 * `status` is the HTTP status (0 for a network/transport error); `code` is the
 * backend's machine-readable error code from its `{ error: { code, message } }`
 * envelope when present.
 */
export default class BackendError extends Error {
  constructor(message, { status = 0, code = 'transport_error', body = null } = {}) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
    this.body = body;
  }

  /** 401/403 — the session is missing, expired, or lacks permission. */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  /** 412 — optimistic-concurrency conflict; caller should refetch and retry. */
  get isRevisionConflict() {
    return this.status === 412;
  }
}
