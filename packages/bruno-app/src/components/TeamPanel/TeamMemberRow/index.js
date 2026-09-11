import { teamInitials, teamAvatarColor } from 'utils/team';
import StyledWrapper from './StyledWrapper';

/**
 * One teammate: avatar, name, and what they're on.
 *
 * The second line is the point of the row — an online teammate reads as "Ada ·
 * GET List orders" rather than just a green dot, and clicking it opens what
 * they're looking at.
 */
const TeamMemberRow = ({ member, onOpen }) => {
  const { name, role, online, isSelf, requestId, activity } = member;
  const clickable = Boolean(onOpen && requestId && activity);

  const subtitle = () => {
    if (!online) return role || 'member';
    if (!requestId) return role || 'idle';
    if (activity === undefined) return 'opening something…';
    if (activity === null) return 'somewhere you can’t see';
    return activity.name;
  };

  return (
    <StyledWrapper
      className={`member-row ${online ? 'is-online' : 'is-offline'} ${clickable ? 'is-clickable' : ''}`}
      onClick={clickable ? onOpen : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      title={clickable ? `Open ${activity.name}` : name}
      data-testid={`team-member-${name}`}
    >
      <span className="avatar-wrap">
        <span className="avatar" style={{ background: teamAvatarColor(member.userId) }}>
          {teamInitials(name)}
        </span>
        <span className="status-dot" aria-label={online ? 'online' : 'offline'} />
      </span>

      <span className="member-text">
        <span className="member-name">
          {name}
          {isSelf && <span className="you-chip">you</span>}
        </span>
        <span className="member-activity">
          {online && requestId && activity && <span className="method">{activity.method}</span>}
          <span className="activity-text">{subtitle()}</span>
        </span>
      </span>
    </StyledWrapper>
  );
};

export default TeamMemberRow;
