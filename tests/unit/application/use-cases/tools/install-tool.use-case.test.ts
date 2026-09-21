/**
 * InstallToolUseCase Unit Tests
 *
 * Tests for executing tool installation with output streaming.
 * Uses mock tool installer service (manual mock object).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstallToolUseCase } from '@/application/use-cases/tools/install-tool.use-case.js';
import type { ToolInstallationStatus } from '@/domain/generated/output.js';
import type { IToolInstallerService } from '@/application/ports/output/services/index.js';
import type {
  IToolMetadataProvider,
  ToolMetadata,
} from '@/application/ports/output/services/tool-metadata-provider.interface.js';

function makeMetadata(overrides: Partial<ToolMetadata> = {}): ToolMetadata {
  return {
    name: 'Test Tool',
    summary: 'summary',
    description: 'description',
    tags: ['ide'],
    binary: 'test-tool',
    packageManager: 'brew',
    commands: { linux: 'echo install', darwin: 'echo install', win32: 'echo install' },
    timeout: 1000,
    documentationUrl: 'https://example.invalid',
    verifyCommand: 'test-tool --version',
    ...overrides,
  };
}

describe('InstallToolUseCase', () => {
  let useCase: InstallToolUseCase;
  let mockService: IToolInstallerService;
  let mockMetadata: IToolMetadataProvider;

  beforeEach(() => {
    mockService = {
      checkAvailability: vi.fn(),
      getInstallCommand: vi.fn(),
      executeInstall: vi
        .fn<
          (toolName: string, onOutput?: (data: string) => void) => Promise<ToolInstallationStatus>
        >()
        .mockResolvedValue({
          status: 'available',
          toolName: 'test-tool',
        }),
      listAvailableTerminals: vi.fn(),
      getTerminalOpenConfig: vi.fn(),
    };

    mockMetadata = {
      getToolById: vi.fn().mockReturnValue(makeMetadata()),
      getAllEntries: vi.fn().mockReturnValue([]),
    };

    useCase = new InstallToolUseCase(mockService, mockMetadata);
  });

  describe('tool installation', () => {
    it('should call executeInstall on the service with correct toolName', async () => {
      // Act
      await useCase.execute('vscode');

      // Assert
      expect(mockService.executeInstall).toHaveBeenCalledWith('vscode', undefined);
    });

    it('should return ToolInstallationStatus from service on success', async () => {
      // Arrange
      const expectedStatus: ToolInstallationStatus = {
        status: 'available',
        toolName: 'vscode',
      };
      vi.mocked(mockService.executeInstall).mockResolvedValue(expectedStatus);

      // Act
      const result = await useCase.execute('vscode');

      // Assert
      expect(result).toEqual(expectedStatus);
      expect(result.status).toBe('available');
    });

    it('should return error status on timeout', async () => {
      // Arrange
      const expectedStatus: ToolInstallationStatus = {
        status: 'error',
        toolName: 'vscode',
        errorMessage: 'Installation timeout after 300 seconds',
      };
      vi.mocked(mockService.executeInstall).mockResolvedValue(expectedStatus);

      // Act
      const result = await useCase.execute('vscode');

      // Assert
      expect(result).toEqual(expectedStatus);
      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('timeout');
    });

    it('should return error status on non-zero exit', async () => {
      // Arrange
      const expectedStatus: ToolInstallationStatus = {
        status: 'error',
        toolName: 'vscode',
        errorMessage: 'Installation process exited with code 127',
      };
      vi.mocked(mockService.executeInstall).mockResolvedValue(expectedStatus);

      // Act
      const result = await useCase.execute('vscode');

      // Assert
      expect(result).toEqual(expectedStatus);
      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('exited');
    });

    it('should pass onOutput callback through to service', async () => {
      // Arrange
      const onOutput = vi.fn();

      // Act
      await useCase.execute('vscode', onOutput);

      // Assert
      expect(mockService.executeInstall).toHaveBeenCalledWith('vscode', onOutput);
    });

    it('should call service exactly once per execution', async () => {
      // Act
      await useCase.execute('cursor');

      // Assert
      expect(mockService.executeInstall).toHaveBeenCalledOnce();
    });
  });

  describe('autoInstall guard', () => {
    // The guard used to live only in the CLI command, so the HTTP route
    // reached `executeInstall` — and its `spawn(cmd, [], { shell: true })` —
    // for tools the catalogue marks as manual-install-only.

    it('refuses to install a tool whose metadata sets autoInstall: false', async () => {
      vi.mocked(mockMetadata.getToolById).mockReturnValue(makeMetadata({ autoInstall: false }));

      const result = await useCase.execute('cursor');

      expect(mockService.executeInstall).not.toHaveBeenCalled();
      expect(result.status).toBe('error');
      expect(result.toolName).toBe('cursor');
      expect(result.errorMessage).toMatch(/automated installation/i);
    });

    it('refuses to install a tool that is not in the catalogue at all', async () => {
      vi.mocked(mockMetadata.getToolById).mockReturnValue(undefined);

      const result = await useCase.execute('../../etc/passwd');

      expect(mockService.executeInstall).not.toHaveBeenCalled();
      expect(result.status).toBe('error');
    });

    it('installs when metadata omits autoInstall (defaults to allowed)', async () => {
      vi.mocked(mockMetadata.getToolById).mockReturnValue(makeMetadata());

      await useCase.execute('vscode');

      expect(mockService.executeInstall).toHaveBeenCalledWith('vscode', undefined);
    });

    it('installs when metadata sets autoInstall: true', async () => {
      vi.mocked(mockMetadata.getToolById).mockReturnValue(makeMetadata({ autoInstall: true }));

      await useCase.execute('vscode');

      expect(mockService.executeInstall).toHaveBeenCalledOnce();
    });
  });
});
