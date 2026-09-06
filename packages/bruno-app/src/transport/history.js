/**
 * Builds the redacted request-execution record the client POSTs to
 * `/workspaces/:id/history` after every send against a team collection.
 *
 * The backend stores the snapshot verbatim and never re-scans it, so redaction
 * is the client's job: auth headers are dropped and any exact occurrence of a
 * known secret value is masked before the record leaves the renderer.
 */

const MASK = '••••••';
const DROP_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);

const CLIENT_KIND = typeof window !== 'undefined' && window.ipcRenderer ? 'desktop' : 'web';

const maskSecrets = (value, secrets) => {
  if (typeof value !== 'string' || !secrets.length) return value;
  let out = value;
  for (const s of secrets) {
    if (s) out = out.split(s).join(MASK);
  }
  return out;
};

const redactHeaders = (headers, secrets) => {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (DROP_HEADERS.has(k.toLowerCase())) {
      out[k] = MASK;
      continue;
    }
    out[k] = Array.isArray(v) ? v.map((x) => maskSecrets(String(x), secrets)) : maskSecrets(String(v), secrets);
  }
  return out;
};

const redactBody = (data, secrets) => {
  if (data == null) return null;
  if (typeof data === 'string') {
    return data.length > 100_000 ? '<omitted: large body>' : maskSecrets(data, secrets);
  }
  try {
    const json = JSON.stringify(data);
    if (json.length > 100_000) return '<omitted: large body>';
    return JSON.parse(maskSecrets(json, secrets));
  } catch {
    return '<omitted: non-serializable body>';
  }
};

/** Every secret string value the request could have interpolated. */
export const collectSecretValues = (...envs) => {
  const out = [];
  for (const env of envs) {
    for (const v of env?.variables || []) {
      if (v.secret && v.value) out.push(String(v.value));
    }
  }
  return out;
};

/**
 * @param {object} p
 * @param {object} p.item          the request item (uid = backend id)
 * @param {object} p.collection    the team collection
 * @param {object} [p.environment] the active environment (uid = backend id)
 * @param {object} p.response      the send result (status/headers/size/duration)
 * @param {object} [p.requestSent] the prepared request the client actually sent
 * @param {string[]} p.secrets     secret values to mask (from collectSecretValues)
 */
export const buildHistoryEntry = ({ item, collection, environment, response, requestSent, secrets = [] }) => {
  const req = requestSent || {};
  const effective = item.draft?.request || item.request || {};

  const snapshot = {
    method: req.method || effective.method || 'GET',
    url: maskSecrets(req.url || effective.url || '', secrets),
    headers: redactHeaders(req.headers, secrets),
    body: redactBody(req.data, secrets)
  };

  const responseMeta = response?.isError
    ? { error: response.error || 'request failed', status: response.status ?? null }
    : {
        status: response?.status ?? null,
        statusText: response?.statusText || '',
        headers: response?.headers || {},
        size: typeof response?.size === 'number' ? response.size : null,
        durationMs: typeof response?.duration === 'number' ? response.duration : null
      };

  return {
    collectionId: collection.backendId,
    requestId: item.uid,
    environmentId: environment?.uid || null,
    clientKind: CLIENT_KIND,
    requestSnapshot: snapshot,
    responseMeta,
    assertions: item.assertionResults || [],
    tests: item.testResults || []
  };
};
