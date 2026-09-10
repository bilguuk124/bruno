import { buildHistoryEntry, collectSecretValues, captureResponseBody } from './history';

const collection = { backendId: 'col-1', workspaceBackendId: 'ws-1' };
const item = { uid: 'req-1', request: { method: 'GET', url: 'https://api/x' }, assertionResults: [], testResults: [] };

describe('collectSecretValues', () => {
  it('gathers secret values from every env passed', () => {
    const env = { variables: [{ name: 'k', value: 'sk-live', secret: true }, { name: 'u', value: 'plain', secret: false }] };
    const global = { variables: [{ name: 'g', value: 'gsecret', secret: true }] };
    expect(collectSecretValues(env, global, null)).toEqual(['sk-live', 'gsecret']);
  });
});

describe('buildHistoryEntry', () => {
  it('drops auth headers and masks secret values everywhere', () => {
    const entry = buildHistoryEntry({
      item,
      collection,
      environment: { uid: 'env-1' },
      response: { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, size: 12, duration: 42 },
      requestSent: {
        method: 'POST',
        url: 'https://api/x?token=sk-live-abc',
        headers: { 'Authorization': 'Bearer sk-live-abc', 'X-Env': 'sk-live-abc', 'Content-Type': 'application/json' },
        data: '{"key":"sk-live-abc","other":"ok"}'
      },
      secrets: ['sk-live-abc']
    });

    expect(entry).toMatchObject({ collectionId: 'col-1', requestId: 'req-1', environmentId: 'env-1' });
    expect(entry.requestSnapshot.headers.Authorization).toBe('••••••');
    expect(entry.requestSnapshot.headers['X-Env']).toBe('••••••');
    expect(entry.requestSnapshot.url).toBe('https://api/x?token=••••••');
    expect(entry.requestSnapshot.body).toBe('{"key":"••••••","other":"ok"}');
    expect(entry.responseMeta).toEqual({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      size: 12,
      durationMs: 42
    });
  });

  it('records an error response without a status', () => {
    const entry = buildHistoryEntry({
      item,
      collection,
      response: { isError: true, error: 'ECONNREFUSED' },
      requestSent: { method: 'GET', url: 'https://down', headers: {}, data: null }
    });
    expect(entry.responseMeta).toEqual({ error: 'ECONNREFUSED', status: null });
    expect(entry.environmentId).toBeNull();
  });

  it('omits a very large body', () => {
    const entry = buildHistoryEntry({
      item,
      collection,
      response: { status: 200 },
      requestSent: { method: 'POST', url: 'u', headers: {}, data: 'x'.repeat(200_000) }
    });
    expect(entry.requestSnapshot.body).toBe('<omitted: large body>');
  });

  it('carries a responseBodyBlobId through', () => {
    const entry = buildHistoryEntry({
      item,
      collection,
      response: { status: 200 },
      requestSent: { method: 'GET', url: 'u', headers: {}, data: null },
      responseBodyBlobId: 'blob-9'
    });
    expect(entry.responseBodyBlobId).toBe('blob-9');
  });
});

describe('captureResponseBody', () => {
  it('captures a JSON body and masks secrets', () => {
    const cap = captureResponseBody(
      { headers: { 'content-type': 'application/json; charset=utf-8' }, data: { token: 'sk-abc', ok: true } },
      ['sk-abc']
    );
    expect(cap.contentType).toBe('application/json');
    expect(cap.text).toBe('{"token":"••••••","ok":true}');
  });

  it('captures a text/html string body', () => {
    const cap = captureResponseBody({ headers: { 'content-type': 'text/html' }, data: '<h1>hi</h1>' }, []);
    expect(cap).toEqual({ contentType: 'text/html', text: '<h1>hi</h1>' });
  });

  it('skips a binary content type', () => {
    expect(captureResponseBody({ headers: { 'content-type': 'image/png' }, data: 'x' }, [])).toBeNull();
  });

  it('skips a body over the size cap', () => {
    const big = 'a'.repeat(3 * 1024 * 1024);
    expect(captureResponseBody({ headers: { 'content-type': 'text/plain' }, data: big }, [])).toBeNull();
  });

  it('skips an empty response', () => {
    expect(captureResponseBody({ headers: { 'content-type': 'application/json' }, data: null }, [])).toBeNull();
  });
});
