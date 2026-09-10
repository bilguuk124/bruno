import { getBaseUrl, getToken } from './config';

/**
 * WebSocket client for the backend change-feed, one per team workspace.
 *
 * Lifecycle (mirrors the server contract in internal/realtime):
 *   connect -> receive {type:'hello', cursor:N}
 *     - first connect: adopt N as our cursor (the caller has just loaded a
 *       fresh tree, so there is nothing to backfill)
 *     - reconnect: GET /workspaces/:id/changes?since=<ourCursor> to replay
 *       what we missed, then go live
 *   apply {type:'change', event} frames with event.seq > cursor, deduped.
 *
 * The socket is only ever opened by the backendSync middleware, and only for a
 * team workspace — local/default workspaces have no backend to sync with.
 */
// The server drops a presence claim after 30s without a refresh.
const PRESENCE_HEARTBEAT_MS = 15_000;

export default class SyncSocket {
  constructor({ workspaceId, onEvent, onStatus, onPresence }) {
    this.workspaceId = workspaceId;
    this.onEvent = onEvent || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onPresence = onPresence || (() => {});
    this.cursor = null;
    this.stopped = false;
    this.retry = 0;
    this.ws = null;
    this.reconnectTimer = null;
    this.presenceResource = '';
    this.presenceTimer = null;
  }

  /** Tell the workspace which resource this client is now viewing ('' = none). */
  setPresence(resource) {
    this.presenceResource = resource || '';
    this.#sendPresence();
    clearInterval(this.presenceTimer);
    this.presenceTimer = this.presenceResource
      ? setInterval(() => this.#sendPresence(), PRESENCE_HEARTBEAT_MS)
      : null;
  }

  #sendPresence() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'presence', resource: this.presenceResource }));
      } catch {
        /* socket went away — resent on reconnect */
      }
    }
  }

  wsUrl() {
    const base = getBaseUrl().replace(/^http/, 'ws');
    const token = encodeURIComponent(getToken());
    return `${base}/api/v1/ws?workspace=${encodeURIComponent(this.workspaceId)}&access_token=${token}`;
  }

  start() {
    this.stopped = false;
    this.#open();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.presenceTimer);
    this.presenceTimer = null;
    if (this.ws) {
      try {
        this.ws.close(1000, 'client stop');
      } catch {
        /* already closing */
      }
      this.ws = null;
    }
    this.onStatus('disconnected');
  }

  #open() {
    this.onStatus(this.cursor === null ? 'connecting' : 'reconnecting');
    let socket;
    try {
      socket = new WebSocket(this.wsUrl());
    } catch (err) {
      this.#scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onmessage = (msg) => this.#handleMessage(msg);
    socket.onclose = () => {
      if (this.ws === socket) this.ws = null;
      if (!this.stopped) this.#scheduleReconnect();
    };
    socket.onerror = () => {
      // onclose fires next and handles the retry
    };
  }

  async #handleMessage(msg) {
    let frame;
    try {
      frame = JSON.parse(msg.data);
    } catch {
      return;
    }

    if (frame.type === 'hello') {
      this.retry = 0;
      if (this.cursor === null) {
        this.cursor = frame.cursor || 0;
      } else if (frame.cursor > this.cursor) {
        await this.#backfill();
      }
      // Re-assert our presence claim, which the server dropped on the last
      // disconnect.
      if (this.presenceResource) this.#sendPresence();
      this.onStatus('connected');
      return;
    }

    if (frame.type === 'change' && frame.event) {
      const ev = frame.event;
      if (typeof ev.seq === 'number' && ev.seq > this.cursor) {
        this.cursor = ev.seq;
        this.onEvent(ev);
      }
      return;
    }

    if (frame.type === 'presence') {
      this.onPresence({ resource: frame.resource, users: frame.users || [] });
    }
  }

  async #backfill() {
    try {
      const res = await fetch(
        `${getBaseUrl()}/api/v1/workspaces/${this.workspaceId}/changes?since=${this.cursor}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      if (!res.ok) return;
      const body = await res.json();
      for (const ev of body.events || []) {
        if (ev.seq > this.cursor) {
          this.cursor = ev.seq;
          this.onEvent(ev);
        }
      }
      if (typeof body.cursor === 'number' && body.cursor > this.cursor) {
        this.cursor = body.cursor;
      }
    } catch {
      /* a failed backfill just means we replay again on the next reconnect */
    }
  }

  #scheduleReconnect() {
    if (this.stopped) return;
    this.onStatus('reconnecting');
    this.retry += 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.retry, 5));
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.#open(), delay);
  }
}
