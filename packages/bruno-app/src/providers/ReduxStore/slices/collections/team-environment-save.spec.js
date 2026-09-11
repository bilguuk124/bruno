import transport from 'transport';
import { teamSaveEnvironment, resolveEnvConflictTakeTheirs } from 'providers/ReduxStore/slices/collections/team';
import {
  setEnvironmentConflict,
  clearEnvironmentConflict,
  stampEnvironmentRevision,
  saveEnvironment as applySavedEnvironment
} from 'providers/ReduxStore/slices/collections';

jest.mock('transport', () => ({
  backend: { replaceEnvironmentVariables: jest.fn() },
  isRemote: () => true
}));

const COLLECTION_UID = 'team:c1';
const ENV_UID = 'e1';

const envVar = (over = {}) => ({
  uid: 'v1',
  name: 'baseUrl',
  value: 'https://staging.example.com',
  type: 'text',
  dataType: 'string',
  enabled: true,
  secret: false,
  description: null,
  revision: 2,
  ...over
});

const stateWith = (variables, over = {}) => ({
  collections: {
    collections: [
      {
        uid: COLLECTION_UID,
        origin: 'team',
        backendId: 'c1',
        items: [],
        environments: [{ uid: ENV_UID, name: 'Staging', revision: 7, variables, ...over }]
      }
    ]
  }
});

const runThunk = (thunk, state) => {
  const dispatched = [];
  const dispatch = jest.fn((action) => {
    if (typeof action === 'function') return action(dispatch, () => state);
    dispatched.push(action);
    return action;
  });
  return { result: thunk(dispatch, () => state), dispatched };
};

beforeEach(() => jest.clearAllMocks());

it('sends the whole set in one call, carrying the environment revision', async () => {
  transport.backend.replaceEnvironmentVariables.mockResolvedValue({
    id: ENV_UID,
    revision: 8,
    variables: [
      { id: 'v1', name: 'baseUrl', value: 'https://prod.example.com', isSecret: false, enabled: true, dataType: 'text', revision: 3 },
      { id: 'v2', name: 'apiKey', isSecret: true, hasValue: true, enabled: true, dataType: 'text', revision: 1 }
    ]
  });

  const edited = [
    envVar({ value: 'https://prod.example.com' }),
    envVar({ uid: null, name: 'apiKey', value: 'typed-secret', secret: true })
  ];
  const { result, dispatched } = runThunk(
    teamSaveEnvironment(edited, ENV_UID, COLLECTION_UID),
    stateWith([envVar()])
  );
  await result;

  expect(transport.backend.replaceEnvironmentVariables).toHaveBeenCalledTimes(1);
  const [envId, desired, revision] = transport.backend.replaceEnvironmentVariables.mock.calls[0];
  expect(envId).toBe(ENV_UID);
  expect(revision).toBe(7);
  expect(desired).toEqual([
    { id: 'v1', name: 'baseUrl', enabled: true, dataType: 'text', description: null, isSecret: false, value: 'https://prod.example.com' },
    { name: 'apiKey', enabled: true, dataType: 'text', description: null, isSecret: true, value: 'typed-secret' }
  ]);

  // The new revision is stamped, since it is the token for the next save.
  expect(dispatched).toContainEqual(stampEnvironmentRevision({ collectionUid: COLLECTION_UID, environmentUid: ENV_UID, revision: 8 }));
  // Local plaintext survives for the secret the server can only mask back.
  const applied = dispatched.find((a) => a.type === applySavedEnvironment.type);
  expect(applied.payload.variables.find((v) => v.name === 'apiKey').value).toBe('typed-secret');
});

// The editor only ever holds a mask for a stored secret, so echoing it back
// would overwrite the real value with the mask.
it('omits the value of a secret the user did not retype', async () => {
  transport.backend.replaceEnvironmentVariables.mockResolvedValue({ id: ENV_UID, revision: 8, variables: [] });
  const stored = envVar({ uid: 'v2', name: 'apiKey', value: '', secret: true });

  const { result } = runThunk(
    teamSaveEnvironment([{ ...stored, enabled: false }], ENV_UID, COLLECTION_UID),
    stateWith([stored])
  );
  await result;

  const [, desired] = transport.backend.replaceEnvironmentVariables.mock.calls[0];
  expect(desired[0]).not.toHaveProperty('value');
  expect(desired[0].isSecret).toBe(true);
  expect(desired[0].enabled).toBe(false);
});

it('raises a conflict instead of reporting a save that did not happen', async () => {
  const err = new Error('stale');
  err.isRevisionConflict = true;
  err.body = {
    current: {
      id: ENV_UID,
      revision: 9,
      variables: [{ id: 'v1', name: 'baseUrl', value: 'https://theirs.example.com', isSecret: false, enabled: true, dataType: 'text', revision: 4 }]
    }
  };
  transport.backend.replaceEnvironmentVariables.mockRejectedValue(err);

  const mine = [envVar({ value: 'https://mine.example.com' })];
  const { result, dispatched } = runThunk(
    teamSaveEnvironment(mine, ENV_UID, COLLECTION_UID),
    stateWith([envVar()])
  );
  const outcome = await result;

  // The caller must be able to tell "not saved" from "saved" — otherwise the
  // editor toasts success over a write that never landed.
  expect(outcome).toEqual({ conflict: true });

  const raised = dispatched.find((a) => a.type === setEnvironmentConflict.type);
  expect(raised.payload.conflict.kind).toBe('stale');
  expect(raised.payload.conflict.mine).toBe(mine);
  // The server's set rides along so the banner can compare without a refetch.
  expect(raised.payload.conflict.server.variables[0].value).toBe('https://theirs.example.com');
  expect(raised.payload.conflict.server.revision).toBe(9);

  // Nothing was applied locally.
  expect(dispatched.some((a) => a.type === applySavedEnvironment.type)).toBe(false);
});

it('a non-conflict failure still surfaces as an error', async () => {
  transport.backend.replaceEnvironmentVariables.mockRejectedValue(new Error('boom'));
  const { result } = runThunk(teamSaveEnvironment([envVar()], ENV_UID, COLLECTION_UID), stateWith([envVar()]));
  await expect(result).rejects.toThrow('boom');
});

it('take theirs adopts the server set from the conflict, with no refetch', async () => {
  const server = {
    uid: ENV_UID,
    revision: 9,
    variables: [envVar({ value: 'https://theirs.example.com', revision: 4 })]
  };
  const state = stateWith([envVar()], { conflict: { kind: 'stale', server, mine: [envVar()] } });

  const { result, dispatched } = runThunk(resolveEnvConflictTakeTheirs(ENV_UID, COLLECTION_UID), state);
  await result;

  const applied = dispatched.find((a) => a.type === applySavedEnvironment.type);
  expect(applied.payload.variables[0].value).toBe('https://theirs.example.com');
  expect(dispatched).toContainEqual(stampEnvironmentRevision({ collectionUid: COLLECTION_UID, environmentUid: ENV_UID, revision: 9 }));
  expect(dispatched).toContainEqual(clearEnvironmentConflict({ collectionUid: COLLECTION_UID, environmentUid: ENV_UID }));
});
