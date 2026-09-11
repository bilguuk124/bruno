import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import transport from 'transport';
import { requestIdFromResource } from 'utils/team';

/**
 * The team for a workspace: everyone who belongs to it, merged with who is
 * actually here right now.
 *
 * Neither half is the team on its own. Membership (REST) knows the people who
 * are offline and carries their roles; the realtime roster knows who is
 * connected and what they're looking at, but only ever lists the people with a
 * socket open. Joined, they give the full list with a live state on each row.
 *
 * Someone present but not in the members list still shows — a superadmin, or a
 * member added since the last load — rather than being silently dropped.
 */
const useTeamRoster = (backendId) => {
  const [members, setMembers] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [loading, setLoading] = useState(Boolean(backendId));
  const [error, setError] = useState(null);

  const teamPresence = useSelector((state) => state.backend.teamPresence);
  const resourceLabels = useSelector((state) => state.backend.resourceLabels);
  const myUserId = useSelector((state) => state.backend.user?.id);

  const reload = useCallback(() => {
    if (!backendId) {
      setMembers([]);
      setMyRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([transport.backend.getWorkspace(backendId), transport.backend.listMembers(backendId)])
      .then(([workspace, res]) => {
        setMyRole(workspace.role);
        setMembers(res.members || []);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load the team'))
      .finally(() => setLoading(false));
  }, [backendId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const { online, offline } = useMemo(() => {
    const presenceByUser = new Map((teamPresence || []).map((p) => [p.userId, p]));

    const rows = (members || [])
      .filter((m) => m.principalType === 'user')
      .map((m) => buildRow(m.principalId, m.name, m.email, m.role, presenceByUser, resourceLabels, myUserId));

    // Anyone connected but absent from the roster we loaded.
    const known = new Set(rows.map((r) => r.userId));
    for (const p of teamPresence || []) {
      if (!known.has(p.userId)) {
        rows.push(buildRow(p.userId, p.name, null, null, presenceByUser, resourceLabels, myUserId));
      }
    }

    // You first, then alphabetically — your own row is the one you look for.
    const byName = (a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    };
    return {
      online: rows.filter((r) => r.online).sort(byName),
      offline: rows.filter((r) => !r.online).sort(byName)
    };
  }, [members, teamPresence, resourceLabels, myUserId]);

  return { online, offline, myRole, loading, error, reload };
};

const buildRow = (userId, name, email, role, presenceByUser, resourceLabels, myUserId) => {
  const presence = presenceByUser.get(userId);
  const requestId = presence ? requestIdFromResource(presence.viewing) : null;
  return {
    userId,
    name: name || presence?.name || 'Unknown',
    email,
    role,
    online: Boolean(presence),
    isSelf: userId === myUserId,
    requestId,
    // undefined while the lookup is in flight, null when it failed.
    activity: requestId ? resourceLabels[requestId] : undefined
  };
};

export default useTeamRoster;
