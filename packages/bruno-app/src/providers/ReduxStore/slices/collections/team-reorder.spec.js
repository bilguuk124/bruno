import { orderAfterDrop } from './team';

const sib = (...uids) => uids.map((uid, i) => ({ uid, seq: i + 1 }));

describe('orderAfterDrop', () => {
  it('reorders within the same parent (drop above)', () => {
    expect(orderAfterDrop(sib('a', 'b', 'c', 'd'), ['d'], 'b', 'above')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('reorders within the same parent (drop below)', () => {
    expect(orderAfterDrop(sib('a', 'b', 'c'), ['a'], 'b', 'below')).toEqual(['b', 'a', 'c']);
  });

  it('appends when dropping inside a folder', () => {
    expect(orderAfterDrop(sib('x', 'y'), ['z'], 'folder-1', 'inside')).toEqual(['x', 'y', 'z']);
  });

  it('places an item arriving from another parent at the target position', () => {
    // `newcomer` is not among the destination siblings yet
    expect(orderAfterDrop(sib('a', 'b', 'c'), ['newcomer'], 'b', 'below')).toEqual(['a', 'b', 'newcomer', 'c']);
  });

  it('appends a newcomer when the target is not in this sibling list', () => {
    expect(orderAfterDrop(sib('a', 'b'), ['n'], 'not-here', 'above')).toEqual(['a', 'b', 'n']);
  });

  it('moves multiple items together, preserving their relative order', () => {
    expect(orderAfterDrop(sib('a', 'b', 'c', 'd', 'e'), ['b', 'd'], 'a', 'below')).toEqual(['a', 'b', 'd', 'c', 'e']);
  });
});
