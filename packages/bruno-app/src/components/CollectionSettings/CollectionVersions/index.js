import { useCallback, useMemo } from 'react';
import transport from 'transport';
import VersionsPanel from 'components/VersionsPanel';

// A collection's versioned state is its root settings, docs and name.
const toDiffData = (snapshot) => ({
  request: { name: snapshot?.name, docs: snapshot?.docs, ...(snapshot?.rootSpec || {}) }
});

/** The Versions tab of a team collection's settings. */
const CollectionVersions = ({ collection }) => {
  const loadHistory = useCallback(
    (limit) => transport.backend.getCollectionHistory(collection.backendId, { limit }),
    [collection.backendId]
  );
  const restore = useCallback(
    (seq) => transport.backend.restoreCollectionVersion(collection.backendId, seq, collection.revision),
    [collection.backendId, collection.revision]
  );
  const currentDiffData = useMemo(
    () => ({
      request: {
        name: collection.name,
        ...((collection.draft?.root || collection.root) ?? {})
      }
    }),
    [collection.name, collection.draft, collection.root]
  );

  return (
    <VersionsPanel
      loadHistory={loadHistory}
      restore={restore}
      toDiffData={toDiffData}
      currentDiffData={currentDiffData}
      reloadKey={collection.revision}
      emptyHint="No recorded versions yet — collection setting changes will appear here."
      restoredMessage="Collection settings restored to that version"
      conflictMessage="This collection changed since you opened it — reopen it and try again"
    />
  );
};

export default CollectionVersions;
