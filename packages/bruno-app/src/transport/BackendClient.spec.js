import BackendClient from './BackendClient';
import BackendError from './BackendError';
import { setBaseUrl, setToken, getToken } from './config';

const jsonResponse = (status, body) =>
  Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    statusText: '',
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body))
  });

let client;

beforeEach(() => {
  window.localStorage.clear();
  setBaseUrl('https://n.example.com');
  setToken('tok_abc');
  client = new BackendClient();
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

it('sends the bearer token, the client-kind header, and parses JSON', async () => {
  global.fetch.mockReturnValue(jsonResponse(200, { workspaces: [] }));
  const out = await client.listWorkspaces();
  expect(out).toEqual({ workspaces: [] });
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toBe('https://n.example.com/api/v1/workspaces');
  expect(init.headers['Authorization']).toBe('Bearer tok_abc');
  expect(init.headers['X-Bruno-Client']).toBe('web'); // jsdom has no window.ipcRenderer
});

it('exposes the session-management endpoints', async () => {
  global.fetch.mockReturnValue(jsonResponse(200, { token: 't2', user: { id: 'u1' } }));
  await client.refresh();
  expect(global.fetch.mock.calls[0][0]).toBe('https://n.example.com/api/v1/auth/refresh');

  global.fetch.mockReturnValue(jsonResponse(204));
  await client.revokeSession('sess-9');
  const [url, init] = global.fetch.mock.calls[1];
  expect(url).toBe('https://n.example.com/api/v1/auth/sessions/sess-9');
  expect(init.method).toBe('DELETE');
});

it('serializes a JSON body and sets content-type', async () => {
  global.fetch.mockReturnValue(jsonResponse(201, { id: 'r1' }));
  await client.createRequest('c1', { name: 'x' });
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toBe('https://n.example.com/api/v1/collections/c1/requests');
  expect(init.method).toBe('POST');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(init.body)).toEqual({ name: 'x' });
});

it('passes If-Match for a revisioned update', async () => {
  global.fetch.mockReturnValue(jsonResponse(200, { id: 'r1', revision: 5 }));
  await client.updateRequest('r1', { name: 'y' }, 4);
  const [, init] = global.fetch.mock.calls[0];
  expect(init.headers['If-Match']).toBe('4');
});

it('returns undefined for 204', async () => {
  global.fetch.mockReturnValue(jsonResponse(204));
  await expect(client.deleteRequest('r1')).resolves.toBeUndefined();
});

it('throws BackendError with the envelope code on failure', async () => {
  global.fetch.mockReturnValue(
    jsonResponse(412, { error: { code: 'revision_stale', message: 'stale' } })
  );
  const err = await client.updateRequest('r1', {}, 1).catch((e) => e);
  expect(err).toBeInstanceOf(BackendError);
  expect(err.status).toBe(412);
  expect(err.code).toBe('revision_stale');
  expect(err.isRevisionConflict).toBe(true);
});

it('clears the session on 401', async () => {
  global.fetch.mockReturnValue(jsonResponse(401, { error: { code: 'unauthorized', message: 'no' } }));
  await client.me().catch(() => {});
  expect(getToken()).toBe('');
});

it('wraps a network failure as a status-0 BackendError', async () => {
  global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  const err = await client.me().catch((e) => e);
  expect(err).toBeInstanceOf(BackendError);
  expect(err.status).toBe(0);
});
