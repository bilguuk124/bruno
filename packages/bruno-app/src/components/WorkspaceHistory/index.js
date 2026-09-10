import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IconExternalLink } from '@tabler/icons';
import Modal from 'components/Modal';
import Button from 'ui/Button';
import HistoryEntryDetail from 'components/HistoryEntryDetail';
import { historyRelativeTime, historyStatusClass, historyStatusLabel } from 'components/HistoryEntryDetail/utils';
import transport from 'transport';
import { addTab, focusTab } from 'providers/ReduxStore/slices/tabs';
import { findItemInCollection } from 'utils/collections';
import StyledWrapper from './StyledWrapper';

const PAGE = 50;

/**
 * A workspace-wide view of the team's persisted request history — every send
 * by anyone, filterable by collection and by "just mine". Rows resolve their
 * collection / request name against the loaded tree; expanding one fetches the
 * full snapshot, and "Open request" jumps to that request's tab.
 */
const WorkspaceHistory = ({ workspace, onClose }) => {
  const dispatch = useDispatch();
  const backendId = workspace?.backendId;
  const currentUserId = useSelector((state) => state.backend.user?.id);
  const collections = useSelector((state) => state.collections.collections);
  const openTabs = useSelector((state) => state.tabs.tabs);

  // Team collections in this workspace, for the filter dropdown and name lookup.
  const teamCollections = useMemo(
    () => collections.filter((c) => c.origin === 'team' && c.workspaceBackendId === backendId),
    [collections, backendId]
  );
  const collectionByBackendId = useMemo(() => {
    const m = new Map();
    for (const c of teamCollections) m.set(c.backendId, c);
    return m;
  }, [teamCollections]);

  const [collectionFilter, setCollectionFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  const loadPage = useCallback(
    (reset) => {
      if (!backendId) return;
      setLoading(true);
      transport.backend
        .listHistory(backendId, {
          collection: collectionFilter || undefined,
          user: mineOnly ? currentUserId : undefined,
          limit: PAGE,
          cursor: reset ? undefined : cursor
        })
        .then((page) => {
          setEntries((cur) => (reset ? page.history || [] : [...cur, ...(page.history || [])]));
          setCursor(page.cursor || null);
          setError(null);
        })
        .catch((err) => setError(err.message || 'Could not load history'))
        .finally(() => setLoading(false));
    },
    [backendId, collectionFilter, mineOnly, currentUserId, cursor]
  );

  // Reload from the top whenever a filter changes.
  useEffect(() => {
    setEntries([]);
    setCursor(null);
    setOpenId(null);
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendId, collectionFilter, mineOnly]);

  const rowMeta = (e) => {
    const collection = collectionByBackendId.get(e.collectionId);
    const item = collection && e.requestId ? findItemInCollection(collection, e.requestId) : null;
    return { collection, item };
  };

  const openRequest = (e) => {
    const { collection, item } = rowMeta(e);
    if (!collection || !item) return;
    const existing = openTabs.find((t) => t.uid === item.uid);
    if (existing) {
      dispatch(focusTab({ uid: item.uid }));
    } else {
      dispatch(addTab({ uid: item.uid, collectionUid: collection.uid, type: item.type, requestPaneTab: 'params' }));
    }
    onClose();
  };

  return (
    <Modal size="lg" title={`History — ${workspace?.name || ''}`} handleCancel={onClose} hideFooter>
      <StyledWrapper>
        <div className="filters">
          <select className="textbox" value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
            <option value="">All collections</option>
            {teamCollections.map((c) => (
              <option key={c.backendId} value={c.backendId}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="mine">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            Only my activity
          </label>
        </div>

        {error && <div className="msg error-text">{error}</div>}
        {!error && entries.length === 0 && !loading && <div className="msg muted">No history recorded yet.</div>}

        <ul className="rows">
          {entries.map((e) => {
            const { collection, item } = rowMeta(e);
            const label = collection
              ? `${collection.name}${item ? ` / ${item.name}` : ''}`
              : 'a deleted collection';
            return (
              <li key={e.id}>
                <div className="row">
                  <button className="row-main" onClick={() => setOpenId((cur) => (cur === e.id ? null : e.id))}>
                    <span className={`status ${historyStatusClass(e.responseMeta)}`}>
                      {historyStatusLabel(e.responseMeta)}
                    </span>
                    <span className="label">{label}</span>
                    <span className="who">{e.userName || 'unknown'}</span>
                    <span className="when">{historyRelativeTime(e.executedAt)}</span>
                  </button>
                  {item && (
                    <button className="open" title="Open request" onClick={() => openRequest(e)}>
                      <IconExternalLink size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
                {openId === e.id && <HistoryEntryDetail entryId={e.id} />}
              </li>
            );
          })}
        </ul>

        {cursor && (
          <div className="more">
            <Button size="xs" color="secondary" variant="outline" disabled={loading} onClick={() => loadPage(false)}>
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </StyledWrapper>
    </Modal>
  );
};

export default WorkspaceHistory;
