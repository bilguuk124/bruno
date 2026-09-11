import { useDispatch } from 'react-redux';
import Button from 'ui/Button';
import ConflictBanner from 'ui/ConflictBanner';
import {
  resolveEnvConflictOverwrite,
  resolveEnvConflictTakeTheirs,
  dismissEnvConflict
} from 'providers/ReduxStore/slices/collections/team';

/**
 * Shown above the variable table when a team environment's save lost a
 * revision race.
 *
 * A variable set saves as a unit, so it conflicts as a unit: the whole table is
 * either yours or theirs. The counts say what the difference actually is, since
 * "someone changed this environment" on its own tells you nothing about whether
 * you're about to lose a row.
 */
const EnvironmentConflictBanner = ({ environment, collectionUid }) => {
  const dispatch = useDispatch();
  const conflict = environment?.conflict;
  if (!conflict) return null;

  const mineCount = (conflict.mine || []).length;
  const theirsCount = (conflict.server?.variables || []).length;

  return (
    <ConflictBanner
      actions={(
        <>
          <Button size="xs" onClick={() => dispatch(resolveEnvConflictOverwrite(environment.uid, collectionUid))}>
            Keep mine
          </Button>
          <Button
            size="xs"
            color="secondary"
            variant="outline"
            onClick={() => dispatch(resolveEnvConflictTakeTheirs(environment.uid, collectionUid))}
          >
            Take theirs
          </Button>
          <Button
            size="xs"
            color="secondary"
            variant="ghost"
            onClick={() => dispatch(dismissEnvConflict(environment.uid, collectionUid))}
          >
            Keep editing
          </Button>
        </>
      )}
    >
      This environment changed on the server, so nothing was saved.
      {conflict.server && ` Theirs has ${theirsCount} variable${theirsCount === 1 ? '' : 's'}, yours has ${mineCount}.`}
    </ConflictBanner>
  );
};

export default EnvironmentConflictBanner;
