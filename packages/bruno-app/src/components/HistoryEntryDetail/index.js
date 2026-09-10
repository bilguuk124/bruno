import React, { useEffect, useState } from 'react';
import transport from 'transport';
import StyledWrapper from './StyledWrapper';

const kvBlock = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

const asText = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

const ResponseBody = ({ blobId }) => {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let live = true;
    transport.backend
      .getBlob(blobId)
      .then((body) => live && setState({ status: 'ready', body: asText(body) }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [blobId]);

  if (state.status === 'error') return <div className="muted">Could not load the captured response body.</div>;
  if (state.status === 'loading') return <div className="muted">Loading body…</div>;
  return <pre className="body">{state.body}</pre>;
};

/**
 * The expanded view of one persisted history entry — its redacted request
 * snapshot, the response metadata, and any assertions. Fetches the full entry
 * (`GET /history/:id`) by id; the list rows only carry the compact projection.
 * Shared by the per-request History tab and the workspace history browser.
 */
const HistoryEntryDetail = ({ entryId }) => {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setEntry(null);
    setError(null);
    transport.backend
      .getHistoryEntry(entryId)
      .then((e) => live && setEntry(e))
      .catch((err) => live && setError(err.message || 'Could not load entry'));
    return () => {
      live = false;
    };
  }, [entryId]);

  if (error) return <StyledWrapper className="detail error-text">{error}</StyledWrapper>;
  if (!entry) return <StyledWrapper className="detail muted">Loading…</StyledWrapper>;

  const snap = entry.requestSnapshot || {};
  const meta = entry.responseMeta || {};

  return (
    <StyledWrapper className="detail">
      <div className="detail-section">
        <div className="detail-label">
          {snap.method} {snap.url}
        </div>
        {Object.keys(snap.headers || {}).length > 0 && <pre className="kv">{kvBlock(snap.headers)}</pre>}
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
        {Object.keys(meta.headers || {}).length > 0 && <pre className="kv">{kvBlock(meta.headers)}</pre>}
        {entry.responseBodyBlobId && <ResponseBody blobId={entry.responseBodyBlobId} />}
      </div>

      {Array.isArray(entry.assertions) && entry.assertions.length > 0 && (
        <div className="detail-section">
          <div className="detail-label">Assertions</div>
          <pre className="kv">{JSON.stringify(entry.assertions, null, 2)}</pre>
        </div>
      )}
    </StyledWrapper>
  );
};

export default HistoryEntryDetail;
