import React, { useEffect, useState, useCallback } from 'react';
import transport from 'transport';
import StyledWrapper from './StyledWrapper';

const relativeTime = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

const statusClass = (meta) => {
  const code = meta?.status;
  if (meta?.error || code === null || code === undefined) return 'err';
  if (code >= 500) return 'err';
  if (code >= 400) return 'warn';
  if (code >= 200 && code < 300) return 'ok';
  return '';
};

const Detail = ({ id }) => {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    transport.backend
      .getHistoryEntry(id)
      .then((e) => live && setEntry(e))
      .catch((err) => live && setError(err.message || 'Could not load entry'));
    return () => {
      live = false;
    };
  }, [id]);

  if (error) return <div className="detail error-text">{error}</div>;
  if (!entry) return <div className="detail muted">Loading…</div>;

  const snap = entry.requestSnapshot || {};
  const meta = entry.responseMeta || {};
  return (
    <div className="detail">
      <div className="detail-section">
        <div className="detail-label">{snap.method} {snap.url}</div>
        {Object.keys(snap.headers || {}).length > 0 && (
          <pre className="kv">{Object.entries(snap.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
        )}
        {snap.body != null && snap.body !== '' && (
          <pre className="body">{typeof snap.body === 'string' ? snap.body : JSON.stringify(snap.body, null, 2)}</pre>
        )}
      </div>
      <div className="detail-section">
        <div className="detail-label">
          Response {meta.error ? `— ${meta.error}` : `${meta.status ?? ''} ${meta.statusText || ''}`}
          {typeof meta.durationMs === 'number' ? ` · ${meta.durationMs} ms` : ''}
          {typeof meta.size === 'number' ? ` · ${meta.size} B` : ''}
        </div>
        {Object.keys(meta.headers || {}).length > 0 && (
          <pre className="kv">{Object.entries(meta.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
        )}
      </div>
      {Array.isArray(entry.assertions) && entry.assertions.length > 0 && (
        <div className="detail-section">
          <div className="detail-label">Assertions</div>
          <pre className="kv">{JSON.stringify(entry.assertions, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

/**
 * The team's shared, persisted execution history for one request — distinct
 * from the session-only Timeline. Backed by /workspaces/:id/history.
 */
const History = ({ collection, item }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  const responseKey = item?.response?.timeline?.length ?? item?.requestState ?? 0;

  const load = useCallback(() => {
    if (!collection?.workspaceBackendId || !item?.uid) return;
    setLoading(true);
    transport.backend
      .listHistory(collection.workspaceBackendId, { request: item.uid, limit: 50 })
      .then((page) => {
        setEntries(page.history || []);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load history'))
      .finally(() => setLoading(false));
  }, [collection?.workspaceBackendId, item?.uid]);

  useEffect(() => {
    load();
  }, [load, responseKey]);

  if (error) return <StyledWrapper><div className="error-text p-4">{error}</div></StyledWrapper>;
  if (loading && entries.length === 0) return <StyledWrapper><div className="muted p-4">Loading history…</div></StyledWrapper>;
  if (entries.length === 0) return <StyledWrapper><div className="muted p-4">No runs recorded for this request yet.</div></StyledWrapper>;

  return (
    <StyledWrapper>
      <ul className="rows">
        {entries.map((e) => (
          <li key={e.id}>
            <button className="row" onClick={() => setOpenId((cur) => (cur === e.id ? null : e.id))}>
              <span className={`status ${statusClass(e.responseMeta)}`}>
                {e.responseMeta?.error ? 'ERR' : (e.responseMeta?.status ?? '—')}
              </span>
              <span className="when">{relativeTime(e.executedAt)}</span>
              {typeof e.responseMeta?.durationMs === 'number' && <span className="dur">{e.responseMeta.durationMs} ms</span>}
              <span className="who">{e.userName || 'unknown'}</span>
              <span className="client">{e.clientKind}</span>
            </button>
            {openId === e.id && <Detail id={e.id} />}
          </li>
        ))}
      </ul>
    </StyledWrapper>
  );
};

export default History;
