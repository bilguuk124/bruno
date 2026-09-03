import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { IconLogout } from '@tabler/icons';
import Button from 'ui/Button';
import ActionIcon from 'ui/ActionIcon';
import { logoutBackend } from 'providers/ReduxStore/slices/backend';
import transport from 'transport';
import StyledWrapper from './StyledWrapper';

const relativeTime = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

/** Preferences → Connection: the user's other signed-in sessions, with revoke. */
const ActiveSessions = () => {
  const dispatch = useDispatch();
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    transport.backend
      .listSessions()
      .then((res) => setSessions(res.sessions || []))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = (session) => {
    setBusy(true);
    transport.backend
      .revokeSession(session.id)
      .then(() => {
        if (session.current) {
          dispatch(logoutBackend());
        } else {
          toast.success('Session ended');
          load();
        }
      })
      .catch((err) => toast.error(err.message || 'Could not end session'))
      .finally(() => setBusy(false));
  };

  const revokeOthers = () => {
    setBusy(true);
    transport.backend
      .revokeOtherSessions()
      .then((res) => {
        toast.success(res.revoked ? `Signed out ${res.revoked} other session(s)` : 'No other sessions');
        load();
      })
      .catch((err) => toast.error(err.message || 'Could not end sessions'))
      .finally(() => setBusy(false));
  };

  if (sessions === null) return null;

  return (
    <StyledWrapper>
      <div className="sessions-header">
        <span className="sessions-title">Active sessions</span>
        {sessions.length > 1 ? (
          <Button color="secondary" variant="ghost" size="xs" disabled={busy} onClick={revokeOthers}>
            Sign out everywhere else
          </Button>
        ) : null}
      </div>
      <ul className="sessions-list">
        {sessions.map((session) => (
          <li key={session.id} className="session-row">
            <div className="session-meta">
              <span className="session-kind">
                {session.clientKind}
                {session.current ? <span className="session-current"> · this device</span> : null}
              </span>
              <span className="session-detail">
                {session.ip || 'unknown ip'} · started {relativeTime(session.createdAt)}
              </span>
            </div>
            <ActionIcon label="End session" disabled={busy} onClick={() => revoke(session)}>
              <IconLogout size={15} strokeWidth={1.5} />
            </ActionIcon>
          </li>
        ))}
      </ul>
    </StyledWrapper>
  );
};

export default ActiveSessions;
