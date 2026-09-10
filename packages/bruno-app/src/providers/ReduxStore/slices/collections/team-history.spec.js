jest.mock('transport', () => ({
  __esModule: true,
  default: { backend: { uploadBlob: jest.fn(), createHistoryEntry: jest.fn() } }
}));

import transport from 'transport';
import { teamRecordHistory } from './team';

const backend = transport.backend;

const collection = {
  uid: 'team:c1',
  origin: 'team',
  backendId: 'c1',
  workspaceBackendId: 'ws1',
  items: [{ uid: 'r1', name: 'R', type: 'http-request', request: { method: 'GET', url: 'https://api/x' } }]
};

const getState = () => ({
  collections: { collections: [collection] },
  globalEnvironments: { globalEnvironments: [], activeGlobalEnvironmentUid: null }
});

const run = (response) =>
  teamRecordHistory({ itemUid: 'r1', collectionUid: 'team:c1', response, requestSent: { method: 'GET', url: 'https://api/x', headers: {} } })(
    jest.fn(),
    getState
  );

beforeEach(() => {
  jest.clearAllMocks();
  backend.createHistoryEntry.mockResolvedValue({});
});

it('uploads a text/JSON response body and references the blob id', async () => {
  backend.uploadBlob.mockResolvedValue({ id: 'blob-1' });

  await run({ status: 200, headers: { 'content-type': 'application/json' }, data: { ok: true } });

  expect(backend.uploadBlob).toHaveBeenCalledWith('ws1', '{"ok":true}', {
    filename: 'response-body',
    contentType: 'application/json'
  });
  expect(backend.createHistoryEntry).toHaveBeenCalledWith('ws1', expect.objectContaining({ responseBodyBlobId: 'blob-1' }));
});

it('still records the entry when the blob upload fails', async () => {
  backend.uploadBlob.mockRejectedValue(new Error('boom'));

  await run({ status: 200, headers: { 'content-type': 'text/plain' }, data: 'hello' });

  expect(backend.createHistoryEntry).toHaveBeenCalledWith('ws1', expect.objectContaining({ responseBodyBlobId: null }));
});

it('does not upload a binary body', async () => {
  await run({ status: 200, headers: { 'content-type': 'application/octet-stream' }, dataBuffer: 'AAAA' });

  expect(backend.uploadBlob).not.toHaveBeenCalled();
  expect(backend.createHistoryEntry).toHaveBeenCalledWith('ws1', expect.objectContaining({ responseBodyBlobId: null }));
});
