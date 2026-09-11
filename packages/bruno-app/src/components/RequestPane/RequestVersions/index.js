import { useCallback, useMemo } from 'react';
import transport from 'transport';
import VersionsPanel from 'components/VersionsPanel';

// A backend snapshot promotes method/url to columns; the diff wants them on the
// request object alongside the rest of the spec.
const toDiffData = (snapshot) => {
  const spec = snapshot && typeof snapshot.spec === 'object' ? snapshot.spec : {};
  return {
    request: {
      ...spec,
      method: snapshot?.method ?? spec.method ?? 'GET',
      url: snapshot?.url ?? spec.url ?? ''
    }
  };
};

/**
 * The Versions tab of a team request. Shared with every other request kind —
 * http, graphql, grpc and ws all version identically on the backend.
 */
const RequestVersions = ({ item }) => {
  const loadHistory = useCallback((limit) => transport.backend.getRequestHistory(item.uid, { limit }), [item.uid]);
  const restore = useCallback(
    (seq) => transport.backend.restoreRequestVersion(item.uid, seq, item.revision),
    [item.uid, item.revision]
  );
  const currentDiffData = useMemo(() => ({ request: item.draft?.request || item.request }), [item.draft, item.request]);

  return (
    <VersionsPanel
      loadHistory={loadHistory}
      restore={restore}
      toDiffData={toDiffData}
      currentDiffData={currentDiffData}
      reloadKey={item.revision}
      emptyHint="No recorded versions yet — edits will appear here."
      restoredMessage="Request restored to that version"
      conflictMessage="This request changed since you opened it — reopen it and try again"
    />
  );
};

export default RequestVersions;
