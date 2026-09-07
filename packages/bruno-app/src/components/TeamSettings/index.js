import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { IconCopy, IconCheck, IconTrash, IconUserPlus } from '@tabler/icons';
import toast from 'react-hot-toast';
import Modal from 'components/Modal';
import Button from 'ui/Button';
import transport from 'transport';
import { getBaseUrl } from 'transport/config';
import useCopyToClipboard from 'hooks/useCopyToClipboard';
import StyledWrapper from './StyledWrapper';

// Owner is deliberately absent: ownership is transferred, not assigned from a
// dropdown, and the backend rejects an `owner` invite outright.
const ASSIGNABLE_ROLES = ['admin', 'editor', 'runner', 'viewer'];

const inviteLink = (token) => `${getBaseUrl()}/?invite=${encodeURIComponent(token)}`;

const expiresInDays = (iso) => {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'expiring soon';
  return `expires in ${days}d`;
};

/**
 * Team-management for a backend ("team") workspace: who is a member, their
 * roles, and pending email invites. Gated on the caller holding `members:manage`
 * (admin or owner) — viewers see the roster read-only.
 */
const TeamSettings = ({ workspace, onClose }) => {
  const backendId = workspace?.backendId;
  const currentUserId = useSelector((state) => state.backend.user?.id);
  const { copied, copyToClipboard } = useCopyToClipboard();

  const [myRole, setMyRole] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState(null); // { email, token }

  const canManage = myRole === 'owner' || myRole === 'admin';

  const load = useCallback(() => {
    if (!backendId) return;
    setLoading(true);
    Promise.all([
      transport.backend.getWorkspace(backendId),
      transport.backend.listMembers(backendId),
      transport.backend.listInvites(backendId).catch(() => ({ invites: [] }))
    ])
      .then(([ws, memberRes, inviteRes]) => {
        setMyRole(ws.role);
        setMembers(memberRes.members || []);
        setInvites(inviteRes.invites || []);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load team settings'))
      .finally(() => setLoading(false));
  }, [backendId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = (member, role) => {
    setBusyKey(member.principalId);
    transport.backend
      .upsertMember(backendId, { principalType: member.principalType, principalId: member.principalId, role })
      .then(() => {
        setMembers((cur) => cur.map((m) => (m.principalId === member.principalId ? { ...m, role } : m)));
      })
      .catch((err) => toast.error(err.message || 'Could not change role'))
      .finally(() => setBusyKey(null));
  };

  const handleRemoveMember = (member) => {
    setBusyKey(member.principalId);
    transport.backend
      .removeMember(backendId, member.principalId, member.principalType)
      .then(() => setMembers((cur) => cur.filter((m) => m.principalId !== member.principalId)))
      .catch((err) => toast.error(err.message || 'Could not remove member'))
      .finally(() => setBusyKey(null));
  };

  const handleInvite = (e) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    transport.backend
      .createInvite(backendId, { email, role: inviteRole })
      .then((res) => {
        setLastInvite({ email, token: res.token });
        setInviteEmail('');
        setInvites((cur) => [res.invite, ...cur]);
      })
      .catch((err) => toast.error(err.message || 'Could not create invite'))
      .finally(() => setInviting(false));
  };

  const handleRevokeInvite = (invite) => {
    setBusyKey(invite.id);
    transport.backend
      .revokeInvite(invite.id)
      .then(() => {
        setInvites((cur) => cur.filter((i) => i.id !== invite.id));
        if (lastInvite && invite.email === lastInvite.email) setLastInvite(null);
      })
      .catch((err) => toast.error(err.message || 'Could not revoke invite'))
      .finally(() => setBusyKey(null));
  };

  return (
    <Modal size="lg" title={`Team — ${workspace?.name || ''}`} handleCancel={onClose} hideFooter>
      <StyledWrapper>
        {error && <div className="error-text">{error}</div>}
        {loading ? (
          <div className="muted">Loading…</div>
        ) : (
          <>
            <div className="section-title">Members</div>
            <table className="member-table">
              <tbody>
                {members.map((m) => {
                  const isSelf = m.principalId === currentUserId;
                  const rowBusy = busyKey === m.principalId;
                  return (
                    <tr key={`${m.principalType}:${m.principalId}`}>
                      <td className="who">
                        <div className="name">{m.name || m.principalId}</div>
                        {m.email && <div className="email muted">{m.email}</div>}
                      </td>
                      <td className="role">
                        {canManage && !isSelf && m.role !== 'owner' ? (
                          <select
                            className="textbox"
                            value={m.role}
                            disabled={rowBusy}
                            onChange={(e) => handleRoleChange(m, e.target.value)}
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="role-static">{m.role}</span>
                        )}
                      </td>
                      <td className="actions">
                        {canManage && !isSelf && (
                          <button
                            className="icon-btn"
                            title="Remove from workspace"
                            disabled={rowBusy}
                            onClick={() => handleRemoveMember(m)}
                          >
                            <IconTrash size={15} strokeWidth={1.5} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {canManage && (
              <>
                <div className="section-title">Invite someone</div>
                <form className="invite-form" onSubmit={handleInvite}>
                  <input
                    type="email"
                    className="textbox flex-1"
                    placeholder="teammate@example.com"
                    value={inviteEmail}
                    autoComplete="off"
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <select className="textbox" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()} icon={<IconUserPlus size={14} strokeWidth={1.5} />}>
                    {inviting ? 'Creating…' : 'Create invite'}
                  </Button>
                </form>

                {lastInvite && (
                  <div className="invite-link">
                    <div className="muted">
                      Send this one-time link to <strong>{lastInvite.email}</strong>. It expires in 14 days.
                    </div>
                    <div className="link-row">
                      <input className="textbox flex-1" readOnly value={inviteLink(lastInvite.token)} />
                      <button
                        className="icon-btn"
                        title="Copy link"
                        onClick={() => copyToClipboard(inviteLink(lastInvite.token)).then(() => toast.success('Link copied'))}
                      >
                        {copied ? <IconCheck size={15} strokeWidth={1.5} /> : <IconCopy size={15} strokeWidth={1.5} />}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {invites.length > 0 && (
              <>
                <div className="section-title">Pending invites</div>
                <table className="member-table">
                  <tbody>
                    {invites.map((i) => (
                      <tr key={i.id}>
                        <td className="who">
                          <div className="name">{i.email}</div>
                          <div className="email muted">
                            {i.role} · invited by {i.inviterName || 'someone'} · {expiresInDays(i.expiresAt)}
                          </div>
                        </td>
                        <td className="role" />
                        <td className="actions">
                          {canManage && (
                            <button
                              className="icon-btn"
                              title="Revoke invite"
                              disabled={busyKey === i.id}
                              onClick={() => handleRevokeInvite(i)}
                            >
                              <IconTrash size={15} strokeWidth={1.5} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </StyledWrapper>
    </Modal>
  );
};

export default TeamSettings;
