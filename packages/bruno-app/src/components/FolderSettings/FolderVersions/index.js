import { useCallback, useMemo } from 'react';
import transport from 'transport';
import VersionsPanel from 'components/VersionsPanel';

// A folder's versioned state is its settings blob (rootSpec) plus its name.
const toDiffData = (snapshot) => ({
  request: { name: snapshot?.name, ...(snapshot?.rootSpec || {}) }
});

/** The Versions tab of a team folder's settings. */
const FolderVersions = ({ folder }) => {
  const loadHistory = useCallback((limit) => transport.backend.getFolderHistory(folder.uid, { limit }), [folder.uid]);
  const restore = useCallback(
    (seq) => transport.backend.restoreFolderVersion(folder.uid, seq, folder.revision),
    [folder.uid, folder.revision]
  );
  const currentDiffData = useMemo(
    () => ({ request: { name: folder.name, ...((folder.draft?.root || folder.root) ?? {}) } }),
    [folder.name, folder.draft, folder.root]
  );

  return (
    <VersionsPanel
      loadHistory={loadHistory}
      restore={restore}
      toDiffData={toDiffData}
      currentDiffData={currentDiffData}
      reloadKey={folder.revision}
      emptyHint="No recorded versions yet — folder setting changes will appear here."
      restoredMessage="Folder settings restored to that version"
      conflictMessage="This folder changed since you opened it — reopen it and try again"
    />
  );
};

export default FolderVersions;
