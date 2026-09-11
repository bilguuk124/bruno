import { teamInitials, teamAvatarColor, teamColorIndex, parsePresenceResource, requestIdFromResource } from './index';

describe('teamInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(teamInitials('Ada Lovelace')).toBe('AL');
    expect(teamInitials('Grace Brewster Murray Hopper')).toBe('GB');
  });

  it('gives a one-word name a single letter', () => {
    expect(teamInitials('Bo')).toBe('B');
  });

  it('falls back rather than rendering nothing', () => {
    expect(teamInitials('')).toBe('?');
    expect(teamInitials(null)).toBe('?');
    expect(teamInitials('   ')).toBe('?');
  });
});

describe('teamAvatarColor', () => {
  it('is stable for the same identity', () => {
    expect(teamAvatarColor('u1')).toBe(teamAvatarColor('u1'));
  });

  it('keys on the id, so a rename does not recolour someone', () => {
    const before = teamAvatarColor('3aa1-uuid');
    expect(teamAvatarColor('3aa1-uuid')).toBe(before);
  });

  it('returns a real colour for an empty key rather than undefined', () => {
    expect(teamAvatarColor(undefined)).toMatch(/^#[0-9a-f]{6}$/);
  });

  // The whole reason for a fixed palette: a handful of teammates should land on
  // visibly different colours, which a continuous hue hash did not guarantee.
  it('spreads a small team across distinct colours', () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const colors = new Set(ids.map(teamAvatarColor));
    expect(colors.size).toBe(ids.length);
  });

  it('indexes inside the palette for any input', () => {
    for (const key of ['', 'a', 'a-very-long-identifier-'.repeat(10), '☃']) {
      const index = teamColorIndex(key);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(teamAvatarColor(key)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('presence resources', () => {
  it('splits kind from id', () => {
    expect(parsePresenceResource('request:9f1c')).toEqual({ kind: 'request', id: '9f1c' });
  });

  it('reads a request id only from a request resource', () => {
    expect(requestIdFromResource('request:9f1c')).toBe('9f1c');
    expect(requestIdFromResource('folder:9f1c')).toBeNull();
    expect(requestIdFromResource('')).toBeNull();
    expect(requestIdFromResource(undefined)).toBeNull();
    expect(requestIdFromResource(':no-kind')).toBeNull();
  });
});
