// @vitest-environment node
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks before imports
const mockSpawn = vi.hoisted(() => vi.fn());
const mockCheckBinaryExists = vi.hoisted(() => vi.fn());
const mockPlatform = vi.hoisted(() => vi.fn<() => string>());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    spawn: mockSpawn,
  };
});

vi.mock('@/infrastructure/services/tool-installer/binary-exists', () => ({
  checkBinaryExists: mockCheckBinaryExists,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    platform: mockPlatform,
  };
});

vi.mock('@/infrastructure/services/tool-installer/tool-metadata', () => ({
  TOOL_METADATA: {
    vscode: {
      name: 'Visual Studio Code',
      tags: ['ide'],
      binary: 'code',
      openDirectory: 'code {dir}',
    },
    cursor: {
      name: 'Cursor',
      tags: ['ide'],
      binary: 'cursor',
      openDirectory: 'cursor {dir}',
    },
    antigravity: {
      name: 'Google Antigravity',
      tags: ['ide'],
      binary: { linux: 'antigravity', darwin: 'agy' },
      openDirectory: { linux: 'antigravity {dir}', darwin: 'agy {dir}' },
    },
    'claude-code': {
      name: 'Claude Code',
      tags: ['cli-agent'],
      binary: 'claude',
      openDirectory: 'cd {dir} && exec claude',
      spawnOptions: { shell: true, stdio: 'inherit', detached: false },
    },
    'no-open-dir': {
      name: 'No Open Dir Tool',
      tags: ['cli-agent'],
      binary: 'noop',
      // No openDirectory — should be excluded
    },
    'broken-ide': {
      name: 'Broken IDE',
      tags: ['ide'],
      binary: 'broken',
      openDirectory: 'broken --open',
      // Missing {dir} placeholder
    },
  },
}));

import { JsonDrivenIdeLauncherService } from '@/infrastructure/services/ide-launchers/json-driven-ide-launcher.service';
import { resolvePlatformValue } from '@/infrastructure/services/ide-launchers/json-driven-ide-launcher.service';

describe('resolvePlatformValue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('linux');
  });

  it('returns the string directly when value is a string', () => {
    expect(resolvePlatformValue('code')).toBe('code');
  });

  it('returns the platform-specific value when value is a record and platform matches', () => {
    mockPlatform.mockReturnValue('darwin');
    expect(resolvePlatformValue({ linux: 'antigravity', darwin: 'agy' })).toBe('agy');
  });

  it('returns the platform-specific value for linux', () => {
    mockPlatform.mockReturnValue('linux');
    expect(resolvePlatformValue({ linux: 'antigravity', darwin: 'agy' })).toBe('antigravity');
  });

  it('falls back to first value when platform key is missing', () => {
    mockPlatform.mockReturnValue('win32');
    expect(resolvePlatformValue({ linux: 'antigravity', darwin: 'agy' })).toBe('antigravity');
  });
});

describe('JsonDrivenIdeLauncherService', () => {
  let service: JsonDrivenIdeLauncherService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('linux');
    service = new JsonDrivenIdeLauncherService();
  });

  describe('editor filtering', () => {
    it('excludes tools without openDirectory from editor map', () => {
      // no-open-dir mock has no openDirectory — should not be launchable
      const result = service.launch('no-open-dir', '/some/path');
      return expect(result).resolves.toMatchObject({
        ok: false,
        code: 'unknown_editor',
      });
    });

    it('excludes IDE tools without openDirectory field', async () => {
      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      // vscode has category "ide" + openDirectory → should be launchable
      const result = await service.launch('vscode', '/some/path');
      expect(result.ok).toBe(true);
    });
  });

  describe('launch', () => {
    it('returns LaunchIdeSuccess with correct editorName and worktreePath', async () => {
      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await service.launch('vscode', '/home/user/project');

      expect(result).toEqual({
        ok: true,
        editorName: 'Visual Studio Code',
        worktreePath: '/home/user/project',
      });
    });

    it('substitutes {dir} placeholder with provided directory path', async () => {
      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      await service.launch('vscode', '/home/user/project');

      expect(mockSpawn).toHaveBeenCalledWith('code', ['/home/user/project'], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
    });

    it('spawns with detached: true, stdio: "ignore" and calls unref()', async () => {
      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      await service.launch('cursor', '/some/path');

      expect(mockSpawn).toHaveBeenCalledWith('cursor', ['/some/path'], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it('returns LaunchIdeFailed with code "unknown_editor" for unrecognized editor ID', async () => {
      const result = await service.launch('notepad', '/some/path');

      expect(result).toEqual({
        ok: false,
        code: 'unknown_editor',
        message: expect.stringContaining('notepad'),
      });
    });

    it('lists available editors in unknown_editor error message', async () => {
      const result = await service.launch('notepad', '/some/path');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('vscode');
        expect(result.message).toContain('cursor');
        expect(result.message).toContain('antigravity');
      }
    });

    it('returns error when openDirectory is missing {dir} placeholder', async () => {
      const result = await service.launch('broken-ide', '/some/path');

      expect(result).toMatchObject({
        ok: false,
        code: 'launch_failed',
      });
      if (!result.ok) {
        expect(result.message).toContain('{dir}');
      }
    });

    it('returns LaunchIdeFailed with code "launch_failed" when spawn throws', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('spawn ENOENT');
      });

      const result = await service.launch('vscode', '/some/path');

      expect(result).toEqual({
        ok: false,
        code: 'launch_failed',
        message: 'spawn ENOENT',
      });
    });

    it('resolves per-platform openDirectory for antigravity on darwin', async () => {
      mockPlatform.mockReturnValue('darwin');
      const svc = new JsonDrivenIdeLauncherService();

      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await svc.launch('antigravity', '/some/path');

      expect(result).toEqual({
        ok: true,
        editorName: 'Google Antigravity',
        worktreePath: '/some/path',
      });
      expect(mockSpawn).toHaveBeenCalledWith('agy', ['/some/path'], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
    });

    it('spawns with shell and stdio inherit for cli-agent with spawnOptions', async () => {
      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await service.launch('claude-code', '/home/user/project');

      expect(result).toEqual({
        ok: true,
        editorName: 'Claude Code',
        worktreePath: '/home/user/project',
      });
      // The directory is quoted: `{dir}` lands inside a shell command string,
      // so an unquoted substitution is the C6 injection.
      expect(mockSpawn).toHaveBeenCalledWith("cd '/home/user/project' && exec claude", [], {
        shell: true,
        stdio: 'inherit',
        detached: false,
      });
    });

    it('does not call unref when detached is false', async () => {
      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      await service.launch('claude-code', '/some/path');

      expect(mockChild.unref).not.toHaveBeenCalled();
    });

    it('keeps directory paths with spaces as a single argument', async () => {
      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      await service.launch('vscode', 'C:/Users/My User/project');

      expect(mockSpawn).toHaveBeenCalledWith('code', ['C:/Users/My User/project'], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
    });

    /**
     * C6 — `openCmd.replace('{dir}', directoryPath)` fed a raw path into a
     * `shell: true` spawn. A worktree directory derived from a branch such as
     * `feat/x$(touch proof)` executed the substitution before the `cd` it was
     * attached to, so a worktree that does not even exist still ran code.
     */
    describe('shell-template directory safety', () => {
      it('single-quotes the directory on posix so metacharacters cannot break out', async () => {
        mockPlatform.mockReturnValue('linux');
        const svc = new JsonDrivenIdeLauncherService();
        mockSpawn.mockReturnValue({ unref: vi.fn() });

        await svc.launch('claude-code', '/home/my user/project');

        expect(mockSpawn).toHaveBeenCalledWith(
          "cd '/home/my user/project' && exec claude",
          [],
          expect.objectContaining({ shell: true })
        );
      });

      it('double-quotes the directory on win32', async () => {
        mockPlatform.mockReturnValue('win32');
        const svc = new JsonDrivenIdeLauncherService();
        mockSpawn.mockReturnValue({ unref: vi.fn() });

        await svc.launch('claude-code', 'C:/Users/My User/project');

        expect(mockSpawn).toHaveBeenCalledWith(
          'cd "C:/Users/My User/project" && exec claude',
          [],
          expect.objectContaining({ shell: true })
        );
      });

      it.each([
        ['command substitution', '/wt/feat-x$(touch proof)'],
        ['backticks', '/wt/feat-x`touch proof`'],
        ['a command separator', '/wt/feat-x;touch proof'],
        ['a background operator', '/wt/feat-x&touch proof'],
        ['a pipe', '/wt/feat-x|touch proof'],
        ['a single quote', "/wt/feat-x'y"],
        ['a newline', '/wt/feat-x\ntouch proof'],
      ])('refuses to launch a shell template with %s in the path', async (_label, dir) => {
        mockPlatform.mockReturnValue('linux');
        const svc = new JsonDrivenIdeLauncherService();
        mockSpawn.mockReturnValue({ unref: vi.fn() });

        const result = await svc.launch('claude-code', dir);

        expect(result).toMatchObject({ ok: false, code: 'launch_failed' });
        expect(mockSpawn).not.toHaveBeenCalled();
      });

      it('still launches argv-mode editors for paths a shell template would refuse', async () => {
        // vscode has no spawnOptions.shell, so the path never reaches a shell
        // and there is nothing to refuse.
        mockPlatform.mockReturnValue('linux');
        const svc = new JsonDrivenIdeLauncherService();
        mockSpawn.mockReturnValue({ unref: vi.fn() });

        const result = await svc.launch('vscode', '/wt/feat-x$(touch proof)');

        expect(result).toMatchObject({ ok: true });
        expect(mockSpawn).toHaveBeenCalledWith(
          'code',
          ['/wt/feat-x$(touch proof)'],
          expect.objectContaining({ shell: false })
        );
      });
    });

    it('resolves per-platform openDirectory for antigravity on linux', async () => {
      mockPlatform.mockReturnValue('linux');
      const svc = new JsonDrivenIdeLauncherService();

      const mockChild = { unref: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      await svc.launch('antigravity', '/some/path');

      expect(mockSpawn).toHaveBeenCalledWith('antigravity', ['/some/path'], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
    });
  });

  describe('checkAvailability', () => {
    it('returns true when binary is found', async () => {
      mockCheckBinaryExists.mockResolvedValue({ found: true });

      const result = await service.checkAvailability('vscode');

      expect(result).toBe(true);
      expect(mockCheckBinaryExists).toHaveBeenCalledWith('code');
    });

    it('returns false when binary is not found', async () => {
      mockCheckBinaryExists.mockResolvedValue({ found: false, notInPath: true });

      const result = await service.checkAvailability('vscode');

      expect(result).toBe(false);
    });

    it('returns false for unknown editor ID', async () => {
      const result = await service.checkAvailability('notepad');

      expect(result).toBe(false);
    });

    it('resolves per-platform binary for antigravity on darwin', async () => {
      mockPlatform.mockReturnValue('darwin');
      const svc = new JsonDrivenIdeLauncherService();

      mockCheckBinaryExists.mockResolvedValue({ found: true });

      const result = await svc.checkAvailability('antigravity');

      expect(result).toBe(true);
      expect(mockCheckBinaryExists).toHaveBeenCalledWith('agy');
    });
  });
});
