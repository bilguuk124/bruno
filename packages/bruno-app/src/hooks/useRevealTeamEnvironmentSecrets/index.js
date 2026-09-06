import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { revealTeamEnvironmentSecrets } from 'providers/ReduxStore/slices/collections/actions';

/**
 * For a team (backend-backed) collection, a secret variable's value is masked
 * until an audited reveal. The env editor needs the real values to let the user
 * see and edit them, so pull them once when an environment with secrets comes
 * into view. Local collections already hold their secrets — this is a no-op.
 */
const useRevealTeamEnvironmentSecrets = (collection, environment) => {
  const dispatch = useDispatch();
  const isTeam = collection?.origin === 'team';
  const environmentUid = environment?.uid;
  const hasMaskedSecret = (environment?.variables || []).some(
    (v) => v.secret && (v.value === undefined || v.value === null || v.value === '')
  );

  useEffect(() => {
    if (isTeam && environmentUid && hasMaskedSecret) {
      dispatch(revealTeamEnvironmentSecrets(environmentUid, collection.uid));
    }
  }, [dispatch, isTeam, environmentUid, hasMaskedSecret, collection?.uid]);
};

export default useRevealTeamEnvironmentSecrets;
