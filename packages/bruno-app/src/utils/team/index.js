/**
 * How a teammate is drawn. One definition, so the same person is the same
 * colour and the same initials wherever they show up — the avatar stack on a
 * request, the team panel, a future activity feed. A colour that shifts between
 * surfaces stops being a way to recognise someone.
 */

/** The first letter of each of the first two words — so a one-word name is a
 *  single letter, which is what the avatar stack has always shown. */
export const teamInitials = (name) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';

/**
 * Eleven widely-spaced hues rather than a hash mapped across the whole colour
 * wheel. A continuous hue is uniformly distributed in theory but clusters in
 * practice at the size a team actually is — three people landing on 293°, 303°
 * and 333° are three indistinguishable purples, which defeats the point of
 * colouring them at all.
 *
 * Each one's lightness is tuned so white text sits at ~5.2:1 on every swatch
 * (comfortably past WCAG AA), which also keeps the avatars at an even visual
 * weight instead of the yellows reading lighter than the blues.
 */
const AVATAR_COLORS = [
  '#c23d42', // red
  '#a15b33', // rust
  '#806a28', // olive
  '#487826', // green
  '#277c52', // emerald
  '#267878', // teal
  '#32729f', // blue
  '#5464c9', // indigo
  '#8453c9', // violet
  '#b038b0', // magenta
  '#bc3b7c' // pink
];

/**
 * A stable index per identity. Keyed on the user id when there is one so a
 * rename doesn't recolour someone mid-session; falls back to the name for
 * rosters that carry no id.
 */
export const teamColorIndex = (key) => {
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % AVATAR_COLORS.length;
  return h;
};

/** The avatar's fill. */
export const teamAvatarColor = (key) => AVATAR_COLORS[teamColorIndex(key)];

/** Presence resources are `<kind>:<id>`; the team panel only knows requests. */
export const parsePresenceResource = (resource) => {
  if (typeof resource !== 'string') return null;
  const at = resource.indexOf(':');
  if (at <= 0) return null;
  return { kind: resource.slice(0, at), id: resource.slice(at + 1) };
};

export const requestIdFromResource = (resource) => {
  const parsed = parsePresenceResource(resource);
  return parsed && parsed.kind === 'request' ? parsed.id : null;
};
