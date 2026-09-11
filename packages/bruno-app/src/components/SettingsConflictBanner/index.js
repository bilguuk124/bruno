import { useDispatch } from 'react-redux';
import Button from 'ui/Button';
import ConflictBanner from 'ui/ConflictBanner';
import {
  resolveCollectionSettingsOverwrite,
  resolveCollectionSettingsTakeTheirs,
  dismissCollectionSettingsConflict,
  resolveFolderSettingsOverwrite,
  resolveFolderSettingsTakeTheirs,
  dismissFolderSettingsConflict
} from 'providers/ReduxStore/slices/collections/team';

/**
 * Shown above collection or folder settings when a save lost a revision race.
 *
 * Both kinds resolve the same three ways, so they share a banner; only which
 * thunk runs differs. `folderUid` picks the folder flavour.
 */
const SettingsConflictBanner = ({ conflict, collectionUid, folderUid }) => {
  const dispatch = useDispatch();
  if (!conflict) return null;

  const isFolder = Boolean(folderUid);
  const overwrite = isFolder
    ? resolveFolderSettingsOverwrite(collectionUid, folderUid)
    : resolveCollectionSettingsOverwrite(collectionUid);
  const takeTheirs = isFolder
    ? resolveFolderSettingsTakeTheirs(collectionUid, folderUid)
    : resolveCollectionSettingsTakeTheirs(collectionUid);
  const dismiss = isFolder
    ? dismissFolderSettingsConflict(collectionUid, folderUid)
    : dismissCollectionSettingsConflict(collectionUid);

  return (
    <ConflictBanner
      actions={(
        <>
          <Button size="xs" onClick={() => dispatch(overwrite)}>
            Keep mine
          </Button>
          <Button size="xs" color="secondary" variant="outline" onClick={() => dispatch(takeTheirs)}>
            Take theirs
          </Button>
          <Button size="xs" color="secondary" variant="ghost" onClick={() => dispatch(dismiss)}>
            Keep editing
          </Button>
        </>
      )}
    >
      These {isFolder ? 'folder' : 'collection'} settings changed on the server, so nothing was saved. Your edits are
      still here.
    </ConflictBanner>
  );
};

export default SettingsConflictBanner;
