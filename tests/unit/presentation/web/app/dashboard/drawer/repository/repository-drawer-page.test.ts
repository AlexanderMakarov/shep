// @vitest-environment node

/**
 * Same defect as the feature drawer slot: `catch { return null }` around
 * resolve + findById turned every failure into a drawer that silently
 * never opens. Only "no such repository" is an expected outcome.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindById = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'IRepositoryRepository') return { findById: mockFindById };
    throw new Error(`Unknown token: ${token}`);
  },
}));

const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404');
const notFound = vi.fn(() => {
  throw NOT_FOUND;
});
vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
}));

const REPO_DRAWER_MARKER = Symbol('RepositoryDrawerClient');
vi.mock('@/components/common/control-center-drawer/repository-drawer-client', () => ({
  RepositoryDrawerClient: Object.assign(() => null, { __marker: REPO_DRAWER_MARKER }),
}));

const { default: RepositoryDrawerPage } = await import(
  '../../../../../../../../src/presentation/web/app/(dashboard)/@drawer/repository/[repositoryId]/page'
);

function params(repositoryId: string) {
  return { params: Promise.resolve({ repositoryId }) };
}

describe('RepositoryDrawerPage (server component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the drawer for an existing repository', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', name: 'shep', path: '/home/me/shep' });

    const element = (await RepositoryDrawerPage(params('repo-1'))) as {
      type: { __marker?: symbol };
      props: { data: { name: string; repositoryPath: string; id: string } };
    };

    expect(element.type.__marker).toBe(REPO_DRAWER_MARKER);
    expect(element.props.data).toEqual({
      name: 'shep',
      repositoryPath: '/home/me/shep',
      id: 'repo-1',
    });
  });

  it('calls notFound() when the repository does not exist', async () => {
    mockFindById.mockResolvedValue(null);

    await expect(RepositoryDrawerPage(params('missing'))).rejects.toBe(NOT_FOUND);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('propagates a repository failure instead of opening an empty drawer', async () => {
    const boom = new Error('database is locked');
    mockFindById.mockRejectedValue(boom);

    await expect(RepositoryDrawerPage(params('repo-1'))).rejects.toBe(boom);
  });
});
