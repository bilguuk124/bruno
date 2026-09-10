import React, { useEffect, useState, useCallback } from 'react';
import transport from 'transport';
import HistoryEntryDetail from 'components/HistoryEntryDetail';
import { historyRelativeTime, historyStatusClass, historyStatusLabel } from 'components/HistoryEntryDetail/utils';
import StyledWrapper from './StyledWrapper';

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
              <span className={`status ${historyStatusClass(e.responseMeta)}`}>{historyStatusLabel(e.responseMeta)}</span>
              <span className="when">{historyRelativeTime(e.executedAt)}</span>
              {typeof e.responseMeta?.durationMs === 'number' && <span className="dur">{e.responseMeta.durationMs} ms</span>}
              <span className="who">{e.userName || 'unknown'}</span>
              <span className="client">{e.clientKind}</span>
            </button>
            {openId === e.id && <HistoryEntryDetail entryId={e.id} />}
          </li>
        ))}
      </ul>
    </StyledWrapper>
  );
};

export default History;
