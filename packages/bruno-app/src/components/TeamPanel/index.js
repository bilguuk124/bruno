import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IconUserPlus } from '@tabler/icons';
import useTeamRoster from 'hooks/useTeamRoster';
import { openTeamResource } from 'providers/ReduxStore/slices/backend';
import TeamSettings from 'components/TeamSettings';
import ActionIcon from 'ui/ActionIcon';
import SidebarSection from 'components/Sidebar/SidebarSection';
import TeamMemberRow from './TeamMemberRow';
import StyledWrapper from './StyledWrapper';

/**
 * Who's on this team, and what they're doing — the sidebar's answer to "am I
 * working with anyone right now?".
 *
 * Everyone in the workspace is listed, online first, each with the request
 * they're looking at. Clicking a teammate who is on something opens it, so you
 * can land where they are without asking.
 *
 * Team workspaces only: a local filesystem workspace has no members and no
 * socket, so the whole section is absent rather than empty.
 */
const TeamPanel = () => {
  const dispatch = useDispatch();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const workspace = useSelector((state) =>
    state.workspaces.workspaces.find((w) => w.uid === state.workspaces.activeWorkspaceUid)
  );
  const backendId = workspace?.type === 'team' ? workspace.backendId : null;

  const { online, offline, myRole, loading, error, reload } = useTeamRoster(backendId);

  if (!backendId) return null;

  const canManage = myRole === 'owner' || myRole === 'admin';

  const handleSettingsClose = () => {
    setSettingsOpen(false);
    // Roles and membership may have changed in there.
    reload();
  };

  const actions = canManage ? (
    <ActionIcon
      label="Invite a teammate"
      onClick={(e) => {
        e.stopPropagation();
        setSettingsOpen(true);
      }}
    >
      <IconUserPlus size={14} stroke={1.5} aria-hidden="true" />
    </ActionIcon>
  ) : null;

  return (
    <>
      {settingsOpen && <TeamSettings workspace={workspace} onClose={handleSettingsClose} />}
      <SidebarSection
        id="team"
        title={online.length > 0 ? `Team — ${online.length} online` : 'Team'}
        icon={TeamSectionIcon}
        actions={actions}
        className="team-section"
      >
        <StyledWrapper data-testid="team-panel">
          {error && <div className="team-message error">{error}</div>}
          {loading && online.length === 0 && offline.length === 0 && (
            <div className="team-message">Loading the team…</div>
          )}

          {online.length > 0 && (
            <>
              <div className="group-label">Online — {online.length}</div>
              {online.map((member) => (
                <TeamMemberRow
                  key={member.userId}
                  member={member}
                  onOpen={() => member.requestId && dispatch(openTeamResource(member.requestId))}
                />
              ))}
            </>
          )}

          {offline.length > 0 && (
            <>
              <div className="group-label">Offline — {offline.length}</div>
              {offline.map((member) => (
                <TeamMemberRow key={member.userId} member={member} />
              ))}
            </>
          )}

          {!loading && !error && online.length === 0 && offline.length === 0 && (
            <div className="team-message">
              It's just you in here.
              {canManage && ' Invite someone with the button above.'}
            </div>
          )}
        </StyledWrapper>
      </SidebarSection>
    </>
  );
};

// Two overlapping figures — a team, rather than the single-user glyph the
// account menu uses.
const TeamSectionIcon = ({ size = 14, stroke = 1.5, className }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
  </svg>
);

export default TeamPanel;
