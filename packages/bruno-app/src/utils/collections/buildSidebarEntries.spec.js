import { buildSidebarEntries } from './index';
import * as platformUtils from 'utils/common/platform';

jest.mock('utils/common/platform', () => ({
  ...jest.requireActual('utils/common/platform'),
  isWindowsOS: jest.fn()
}));

describe('buildSidebarEntries', () => {
  it('matches a workspace collection to its loaded collection by path (case-insensitive on Windows)', () => {
    platformUtils.isWindowsOS.mockReturnValue(true);

    const activeWorkspace = {
      type: 'custom',
      collections: [{ path: 'C:\\users\\bob\\my-collection' }]
    };
    const collections = [{ uid: '123', pathname: 'C:\\Users\\Bob\\My-Collection' }];

    const entries = buildSidebarEntries({ collections, activeWorkspace, workspaces: [] });

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('loaded');
    expect(entries[0].collection).toBe(collections[0]);
  });

  it('keeps path matching case-sensitive on non-Windows, so a case-mismatched path yields no entry', () => {
    platformUtils.isWindowsOS.mockReturnValue(false);

    const activeWorkspace = {
      type: 'custom',
      collections: [{ path: '/users/bob/my-collection' }]
    };
    const collections = [{ uid: '123', pathname: '/Users/Bob/My-Collection' }];

    const entries = buildSidebarEntries({ collections, activeWorkspace, workspaces: [] });

    expect(entries).toHaveLength(0);
  });

  it('matches team-workspace collections by uid (they have no filesystem path)', () => {
    platformUtils.isWindowsOS.mockReturnValue(false);

    const activeWorkspace = {
      type: 'team',
      collections: [{ uid: 'team:abc', name: 'API' }]
    };
    const collections = [{ uid: 'team:abc', name: 'API', pathname: null }];

    const entries = buildSidebarEntries({ collections, activeWorkspace, workspaces: [] });

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('loaded');
    expect(entries[0].collection).toBe(collections[0]);
  });
});
