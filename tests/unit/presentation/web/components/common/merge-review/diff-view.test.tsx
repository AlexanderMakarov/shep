import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DiffView,
  buildFileTree,
  MAX_LINES_PER_FILE,
} from '@/components/common/merge-review/diff-view';
import type { MergeReviewFileDiff } from '@/components/common/merge-review/merge-review-config';

const rootModifiedFile: MergeReviewFileDiff = {
  path: 'package.json',
  additions: 5,
  deletions: 2,
  status: 'modified',
  hunks: [
    {
      header: '@@ -1,4 +1,7 @@',
      lines: [
        { type: 'context', content: '"name": "my-app",', oldNumber: 1, newNumber: 1 },
        { type: 'removed', content: '"version": "1.0.0",', oldNumber: 2 },
        { type: 'added', content: '"version": "1.1.0",', newNumber: 2 },
        { type: 'context', content: '"main": "index.js"', oldNumber: 3, newNumber: 3 },
      ],
    },
  ],
};

const rootAddedFile: MergeReviewFileDiff = {
  path: 'README.md',
  additions: 10,
  deletions: 0,
  status: 'added',
  hunks: [
    {
      header: '@@ -0,0 +1,3 @@',
      lines: [
        { type: 'added', content: '# My App', newNumber: 1 },
        { type: 'added', content: '', newNumber: 2 },
        { type: 'added', content: 'A great app.', newNumber: 3 },
      ],
    },
  ],
};

const rootDeletedFile: MergeReviewFileDiff = {
  path: 'old-config.js',
  additions: 0,
  deletions: 5,
  status: 'deleted',
  hunks: [
    {
      header: '@@ -1,2 +0,0 @@',
      lines: [
        { type: 'removed', content: 'module.exports = {};', oldNumber: 1 },
        { type: 'removed', content: '', oldNumber: 2 },
      ],
    },
  ],
};

const nestedModifiedFile: MergeReviewFileDiff = {
  path: 'src/components/login.tsx',
  additions: 5,
  deletions: 2,
  status: 'modified',
  hunks: [
    {
      header: '@@ -1,4 +1,7 @@',
      lines: [
        { type: 'context', content: "import React from 'react';", oldNumber: 1, newNumber: 1 },
        { type: 'removed', content: 'function Login() {', oldNumber: 2 },
        { type: 'added', content: 'function Login({ onSubmit }: Props) {', newNumber: 2 },
        { type: 'context', content: '  return <div />;', oldNumber: 3, newNumber: 3 },
      ],
    },
  ],
};

const nestedAddedFile: MergeReviewFileDiff = {
  path: 'src/lib/auth.ts',
  additions: 10,
  deletions: 0,
  status: 'added',
  hunks: [
    {
      header: '@@ -0,0 +1,3 @@',
      lines: [
        { type: 'added', content: 'export function hash() {', newNumber: 1 },
        { type: 'added', content: '  return "hashed";', newNumber: 2 },
        { type: 'added', content: '}', newNumber: 3 },
      ],
    },
  ],
};

const renamedFile: MergeReviewFileDiff = {
  path: 'src/services/user-service.ts',
  oldPath: 'src/services/user.ts',
  additions: 1,
  deletions: 0,
  status: 'renamed',
  hunks: [],
};

describe('buildFileTree', () => {
  it('creates a flat tree for root-level files', () => {
    const files: MergeReviewFileDiff[] = [
      { path: 'package.json', additions: 1, deletions: 0, status: 'modified', hunks: [] },
      { path: 'README.md', additions: 2, deletions: 1, status: 'modified', hunks: [] },
    ];
    const tree = buildFileTree(files);
    expect(tree).toHaveLength(2);
    expect(tree[0].type).toBe('file');
    expect(tree[0].name).toBe('package.json');
    expect(tree[1].type).toBe('file');
    expect(tree[1].name).toBe('README.md');
  });

  it('groups files into folder hierarchy', () => {
    const files: MergeReviewFileDiff[] = [
      { path: 'src/a.ts', additions: 1, deletions: 0, status: 'added', hunks: [] },
      { path: 'src/b.ts', additions: 1, deletions: 0, status: 'added', hunks: [] },
    ];
    const tree = buildFileTree(files);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('src');
    expect(tree[0].type).toBe('folder');
    expect(tree[0].children).toHaveLength(2);
  });

  it('collapses single-child folders', () => {
    const files: MergeReviewFileDiff[] = [
      { path: 'a/b/c/file.ts', additions: 1, deletions: 0, status: 'added', hunks: [] },
    ];
    const tree = buildFileTree(files);
    // a/b/c should collapse into a single node
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('a/b/c');
    expect(tree[0].type).toBe('folder');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].name).toBe('file.ts');
  });

  it('does not collapse folders with multiple children', () => {
    const files: MergeReviewFileDiff[] = [
      { path: 'src/a.ts', additions: 1, deletions: 0, status: 'added', hunks: [] },
      { path: 'src/b.ts', additions: 1, deletions: 0, status: 'added', hunks: [] },
    ];
    const tree = buildFileTree(files);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('src');
    expect(tree[0].children).toHaveLength(2);
  });

  it('handles mixed root and nested files', () => {
    const files: MergeReviewFileDiff[] = [
      { path: 'package.json', additions: 1, deletions: 0, status: 'modified', hunks: [] },
      { path: 'src/index.ts', additions: 1, deletions: 0, status: 'added', hunks: [] },
    ];
    const tree = buildFileTree(files);
    expect(tree).toHaveLength(2);
    const rootFile = tree.find((el) => el.name === 'package.json');
    const folder = tree.find((el) => el.name === 'src');
    expect(rootFile?.type).toBe('file');
    expect(folder?.type).toBe('folder');
  });
});

describe('DiffView', () => {
  describe('rendering', () => {
    it('renders nothing when fileDiffs is empty', () => {
      const { container } = render(<DiffView fileDiffs={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders "Changed Files" header with file count', () => {
      render(<DiffView fileDiffs={[rootModifiedFile, rootAddedFile]} />);

      expect(screen.getByText('Changed Files')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    it('renders root-level file names directly', () => {
      render(<DiffView fileDiffs={[rootModifiedFile, rootAddedFile, rootDeletedFile]} />);

      expect(screen.getByText('package.json')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('old-config.js')).toBeInTheDocument();
    });

    it('displays addition and deletion counts per file', () => {
      render(<DiffView fileDiffs={[rootModifiedFile]} />);

      expect(screen.getByText('+5')).toBeInTheDocument();
      expect(screen.getByText('-2')).toBeInTheDocument();
    });

    it('shows only additions for added files', () => {
      render(<DiffView fileDiffs={[rootAddedFile]} />);

      expect(screen.getByText('+10')).toBeInTheDocument();
      expect(screen.queryByText('-0')).not.toBeInTheDocument();
    });

    it('shows only deletions for deleted files', () => {
      render(<DiffView fileDiffs={[rootDeletedFile]} />);

      expect(screen.getByText('-5')).toBeInTheDocument();
      expect(screen.queryByText('+0')).not.toBeInTheDocument();
    });
  });

  describe('expanding files', () => {
    it('does not show hunk content by default', () => {
      render(<DiffView fileDiffs={[rootModifiedFile]} />);

      expect(screen.queryByText('@@ -1,4 +1,7 @@')).not.toBeInTheDocument();
    });

    it('shows hunk content when file is clicked', () => {
      render(<DiffView fileDiffs={[rootModifiedFile]} />);

      const fileButton = screen.getByRole('button', { name: /package\.json/ });
      fireEvent.click(fileButton);

      expect(screen.getByText('@@ -1,4 +1,7 @@')).toBeInTheDocument();
      expect(screen.getByText('"name": "my-app",')).toBeInTheDocument();
      expect(screen.getByText('"version": "1.0.0",')).toBeInTheDocument();
      expect(screen.getByText('"version": "1.1.0",')).toBeInTheDocument();
    });

    it('hides hunk content when file is clicked again', () => {
      render(<DiffView fileDiffs={[rootModifiedFile]} />);

      const fileButton = screen.getByRole('button', { name: /package\.json/ });
      fireEvent.click(fileButton);
      expect(screen.getByText('@@ -1,4 +1,7 @@')).toBeInTheDocument();

      fireEvent.click(fileButton);
      expect(screen.queryByText('@@ -1,4 +1,7 @@')).not.toBeInTheDocument();
    });

    it('shows diff line content after expanding', () => {
      render(<DiffView fileDiffs={[rootModifiedFile]} />);
      fireEvent.click(screen.getByRole('button', { name: /package\.json/ }));

      expect(screen.getByText('"name": "my-app",')).toBeInTheDocument();
      expect(screen.getByText('"version": "1.0.0",')).toBeInTheDocument();
      expect(screen.getByText('"version": "1.1.0",')).toBeInTheDocument();
    });

    it('does not show hunk pane for file with no hunks', () => {
      render(<DiffView fileDiffs={[renamedFile]} />);

      // src/services is a top-level collapsed folder, auto-expanded
      // Click the file to select it
      fireEvent.click(screen.getByText('user-service.ts'));
      // No hunk header should appear since hunks are empty
      expect(screen.queryByText(/@@ /)).not.toBeInTheDocument();
    });
  });

  describe('renamed files', () => {
    it('shows old file name indicator for renamed files', () => {
      render(<DiffView fileDiffs={[renamedFile]} />);

      // src/services is a top-level collapsed folder, auto-expanded
      expect(screen.getByText('user-service.ts')).toBeInTheDocument();
      expect(screen.getByText(/← user\.ts/)).toBeInTheDocument();
    });
  });

  describe('tree structure', () => {
    it('renders folder nodes with file counts for nested files', () => {
      render(<DiffView fileDiffs={[nestedModifiedFile, nestedAddedFile]} />);

      // src is a top-level folder, expanded by default, showing nested folders
      expect(screen.getByText(/src \(2\)/)).toBeInTheDocument();
      // Nested folders are collapsed — their names are visible as folder labels
      expect(screen.getByText(/components \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/lib \(1\)/)).toBeInTheDocument();
    });

    it('reveals nested files when folder is expanded', () => {
      render(<DiffView fileDiffs={[nestedModifiedFile, nestedAddedFile]} />);

      // Files are hidden inside collapsed sub-folders
      expect(screen.queryByText('login.tsx')).not.toBeInTheDocument();

      // Expand the components folder to reveal login.tsx
      fireEvent.click(screen.getByText(/components \(1\)/));
      expect(screen.getByText('login.tsx')).toBeInTheDocument();
    });

    it('switches selected file when a different file is clicked', () => {
      render(<DiffView fileDiffs={[rootModifiedFile, rootAddedFile]} />);

      // Click first file
      fireEvent.click(screen.getByText('package.json'));
      expect(screen.getByText('@@ -1,4 +1,7 @@')).toBeInTheDocument();

      // Click second file
      fireEvent.click(screen.getByText('README.md'));
      expect(screen.queryByText('@@ -1,4 +1,7 @@')).not.toBeInTheDocument();
      expect(screen.getByText('@@ -0,0 +1,3 @@')).toBeInTheDocument();
    });
  });
});

// ── Accessibility, performance and non-text files ──────────────────────────
//
// The hunk renderer encoded +/- with colour plus a glyph hidden inside a
// `select-none` span: the meaning was carried by colour alone for a sighted
// user (WCAG 1.4.1) and by nothing at all for a screen reader. It also
// emitted one div + four spans per line with no windowing, and dropped
// binary / rename-only files on the floor.

const binaryFile: MergeReviewFileDiff = {
  path: 'assets/logo.png',
  additions: 0,
  deletions: 0,
  status: 'modified',
  hunks: [],
};

const renameOnlyFile: MergeReviewFileDiff = {
  path: 'src/services/billing-service.ts',
  oldPath: 'src/services/billing.ts',
  additions: 0,
  deletions: 0,
  status: 'renamed',
  hunks: [],
};

function hugeFile(lineCount: number): MergeReviewFileDiff {
  return {
    path: 'generated/bundle.js',
    additions: lineCount,
    deletions: 0,
    status: 'modified',
    hunks: [
      {
        header: '@@ -0,0 +1,999999 @@',
        lines: Array.from({ length: lineCount }, (_, i) => ({
          type: 'added' as const,
          content: `const line${i} = ${i};`,
          newNumber: i + 1,
        })),
      },
    ],
  };
}

describe('DiffView — accessibility of diff lines', () => {
  beforeEach(() => {
    render(<DiffView fileDiffs={[rootModifiedFile]} />);
    fireEvent.click(screen.getByRole('button', { name: /package\.json/ }));
  });

  it('groups each hunk and names it with its header', () => {
    expect(screen.getByRole('group', { name: '@@ -1,4 +1,7 @@' })).toBeInTheDocument();
  });

  it('states added / removed / context in the accessible name of every line', () => {
    expect(screen.getByLabelText('removed line 2: "version": "1.0.0",')).toBeInTheDocument();
    expect(screen.getByLabelText('added line 2: "version": "1.1.0",')).toBeInTheDocument();
    expect(screen.getByLabelText('context line 1: "name": "my-app",')).toBeInTheDocument();
  });

  it('hides the line-number gutters and the +/- glyph from assistive tech', () => {
    const line = screen.getByLabelText('added line 2: "version": "1.1.0",');
    const decorations = Array.from(line.children).slice(0, 3);
    expect(decorations).toHaveLength(3);
    for (const span of decorations) {
      expect(span).toHaveAttribute('aria-hidden', 'true');
    }
  });
});

describe('DiffView — long-line and large-file handling', () => {
  it('does not break identifiers mid-token', () => {
    render(<DiffView fileDiffs={[rootModifiedFile]} />);
    fireEvent.click(screen.getByRole('button', { name: /package\.json/ }));

    const content = screen.getByText('"version": "1.1.0",');
    expect(content.className).toContain('whitespace-pre');
    expect(content.className).not.toContain('break-all');
  });

  it('lets the browser skip off-screen lines', () => {
    render(<DiffView fileDiffs={[rootModifiedFile]} />);
    fireEvent.click(screen.getByRole('button', { name: /package\.json/ }));

    const line = screen.getByLabelText('added line 2: "version": "1.1.0",');
    expect(line.style.contentVisibility).toBe('auto');
    expect(line.style.containIntrinsicSize).not.toBe('');
  });

  it('gates a file above the line budget behind an explicit opt-in', () => {
    render(<DiffView fileDiffs={[hugeFile(MAX_LINES_PER_FILE + 1)]} />);
    fireEvent.click(screen.getByText('bundle.js'));

    expect(screen.queryByText('const line0 = 0;')).not.toBeInTheDocument();
    const showAnyway = screen.getByRole('button', { name: /show anyway/i });

    fireEvent.click(showAnyway);
    expect(screen.getByText('const line0 = 0;')).toBeInTheDocument();
  });

  it('renders a file at the line budget without a gate', () => {
    render(<DiffView fileDiffs={[hugeFile(MAX_LINES_PER_FILE)]} />);
    fireEvent.click(screen.getByText('bundle.js'));

    expect(screen.queryByRole('button', { name: /show anyway/i })).not.toBeInTheDocument();
    expect(screen.getByText('const line0 = 0;')).toBeInTheDocument();
  });

  it('re-applies the gate after switching to another oversized file', () => {
    const other = { ...hugeFile(MAX_LINES_PER_FILE + 1), path: 'generated/other.js' };
    render(<DiffView fileDiffs={[hugeFile(MAX_LINES_PER_FILE + 1), other]} />);

    fireEvent.click(screen.getByText('bundle.js'));
    fireEvent.click(screen.getByRole('button', { name: /show anyway/i }));
    expect(screen.getByText('const line0 = 0;')).toBeInTheDocument();

    fireEvent.click(screen.getByText('other.js'));
    expect(screen.getByRole('button', { name: /show anyway/i })).toBeInTheDocument();
  });
});

describe('DiffView — files with no textual diff', () => {
  it('explains a binary file instead of rendering nothing', () => {
    render(<DiffView fileDiffs={[binaryFile]} />);
    fireEvent.click(screen.getByText('logo.png'));

    expect(screen.getByText('assets/logo.png')).toBeInTheDocument();
    expect(screen.getByText(/binary file/i)).toBeInTheDocument();
  });

  it('explains a rename with no content change', () => {
    render(<DiffView fileDiffs={[renameOnlyFile]} />);
    fireEvent.click(screen.getByText('billing-service.ts'));

    expect(screen.getByText('src/services/billing-service.ts')).toBeInTheDocument();
    expect(screen.getByText(/renamed/i)).toBeInTheDocument();
  });
});
