import React from 'react';
import { useSelector } from 'react-redux';
import { teamInitials, teamAvatarColor } from 'utils/team';
import StyledWrapper from './StyledWrapper';

const MAX_SHOWN = 3;

/**
 * The stack of teammates currently viewing this request, from the realtime
 * presence roster. Renders nothing when it's just you (or a local collection).
 */
const PresenceAvatars = ({ resource }) => {
  const meId = useSelector((state) => state.backend.user?.id);
  const roster = useSelector((state) => state.backend.presence[resource]);

  const others = (roster || []).filter((u) => u.userId !== meId);
  if (others.length === 0) return null;

  const shown = others.slice(0, MAX_SHOWN);
  const overflow = others.length - shown.length;

  return (
    <StyledWrapper title={others.map((u) => u.name).join(', ')}>
      {shown.map((u) => (
        <span key={u.userId} className="avatar" style={{ background: teamAvatarColor(u.userId) }}>
          {teamInitials(u.name)}
        </span>
      ))}
      {overflow > 0 && <span className="avatar more">+{overflow}</span>}
    </StyledWrapper>
  );
};

export default PresenceAvatars;
