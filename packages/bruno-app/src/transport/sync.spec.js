jest.mock('./config', () => ({ getBaseUrl: () => 'http://n.example.com', getToken: () => 'tok' }));

import SyncSocket from './sync';

class FakeWS {
  constructor() {
    FakeWS.instances.push(this);
    this.readyState = 1; // OPEN
    this.sent = [];
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  emit(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}
FakeWS.instances = [];
FakeWS.OPEN = 1;

beforeEach(() => {
  FakeWS.instances = [];
  global.WebSocket = FakeWS;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

const connect = (opts = {}) => {
  const sock = new SyncSocket({ workspaceId: 'ws1', ...opts });
  sock.start();
  return { sock, ws: () => FakeWS.instances.at(-1) };
};

it('sends a presence frame and heartbeats it', () => {
  const { sock, ws } = connect();
  sock.setPresence('request:r1');
  expect(ws().sent).toEqual([{ type: 'presence', resource: 'request:r1' }]);

  jest.advanceTimersByTime(15_000);
  expect(ws().sent).toHaveLength(2);
  expect(ws().sent[1]).toEqual({ type: 'presence', resource: 'request:r1' });
});

it('clearing presence sends an empty resource and stops the heartbeat', () => {
  const { sock, ws } = connect();
  sock.setPresence('request:r1');
  sock.setPresence('');
  expect(ws().sent.at(-1)).toEqual({ type: 'presence', resource: '' });

  const before = ws().sent.length;
  jest.advanceTimersByTime(60_000);
  expect(ws().sent).toHaveLength(before);
});

it('re-asserts the presence claim after a reconnect', () => {
  const { sock, ws } = connect();
  ws().emit({ type: 'hello', cursor: 0 }); // first hello
  sock.setPresence('request:r1');

  ws().close();
  jest.advanceTimersByTime(2000); // reconnect backoff
  const fresh = ws();
  fresh.emit({ type: 'hello', cursor: 0 }); // reconnect hello

  expect(fresh.sent.some((f) => f.resource === 'request:r1')).toBe(true);
});

it('routes an inbound presence frame to onPresence', () => {
  const onPresence = jest.fn();
  const { ws } = connect({ onPresence });
  ws().emit({ type: 'presence', resource: 'request:r1', users: [{ userId: 'a', name: 'A' }] });
  expect(onPresence).toHaveBeenCalledWith({ resource: 'request:r1', users: [{ userId: 'a', name: 'A' }] });
});

it('stop() clears the heartbeat', () => {
  const { sock } = connect();
  sock.setPresence('request:r1');
  sock.stop();
  const before = FakeWS.instances.reduce((n, w) => n + w.sent.length, 0);
  jest.advanceTimersByTime(60_000);
  expect(FakeWS.instances.reduce((n, w) => n + w.sent.length, 0)).toBe(before);
});

it('routes the workspace roster frame to onTeamPresence', () => {
  const onTeamPresence = jest.fn();
  const onPresence = jest.fn();
  const { ws } = connect({ onTeamPresence, onPresence });

  ws().emit({ type: 'presence.workspace', team: [{ userId: 'u1', name: 'Ada', viewing: 'request:r1' }] });
  expect(onTeamPresence).toHaveBeenCalledWith([{ userId: 'u1', name: 'Ada', viewing: 'request:r1' }]);
  expect(onPresence).not.toHaveBeenCalled();

  // A roster with nobody on it omits `team` entirely.
  ws().emit({ type: 'presence.workspace' });
  expect(onTeamPresence).toHaveBeenLastCalledWith([]);

  // Per-resource presence still goes to its own callback, not this one.
  ws().emit({ type: 'presence', resource: 'request:r1', users: [{ userId: 'u1', name: 'Ada' }] });
  expect(onPresence).toHaveBeenCalledTimes(1);
  expect(onTeamPresence).toHaveBeenCalledTimes(2);
});
