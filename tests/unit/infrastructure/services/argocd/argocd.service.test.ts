/**
 * ArgoCDService Unit Tests
 *
 * Tests for ArgoCD management via kubectl.
 * Uses constructor-injected exec function mock.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArgoCDService } from '@/infrastructure/services/argocd/argocd.service.js';
import { KubectlError, KubectlErrorCode } from '@/infrastructure/errors/kubectl-error.js';
import { NODE_CLI_TIMEOUT_MS } from '@/infrastructure/services/cli-exec.constants.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

describe('ArgoCDService', () => {
  let service: ArgoCDService;
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;
  const kubeconfigPath = '/tmp/kubeconfig';

  beforeEach(() => {
    mockExecFile = vi.fn<ExecFileFn>();
    service = new ArgoCDService(mockExecFile);
  });

  describe('install', () => {
    it('should create namespace and apply ArgoCD manifests', async () => {
      // First call: create namespace dry-run
      mockExecFile.mockResolvedValueOnce({
        stdout: 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: argocd',
        stderr: '',
      });
      // Second call: apply namespace
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // Third call: apply ArgoCD install manifests
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.install(kubeconfigPath);

      // Verify namespace creation (dry-run) is bounded by the shared CLI timeout
      expect(mockExecFile).toHaveBeenCalledWith(
        'kubectl',
        [
          'create',
          'namespace',
          'argocd',
          '--kubeconfig',
          kubeconfigPath,
          '--dry-run=client',
          '-o',
          'yaml',
        ],
        { timeout: NODE_CLI_TIMEOUT_MS }
      );

      // Verify piped namespace apply is bounded by the shared CLI timeout
      expect(mockExecFile).toHaveBeenCalledWith(
        'kubectl',
        ['apply', '-f', '-', '--kubeconfig', kubeconfigPath],
        {
          input: 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: argocd',
          timeout: NODE_CLI_TIMEOUT_MS,
        }
      );

      // Verify ArgoCD manifest apply is bounded by the shared CLI timeout
      expect(mockExecFile).toHaveBeenCalledWith(
        'kubectl',
        [
          'apply',
          '-n',
          'argocd',
          '-f',
          'https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml',
          '--kubeconfig',
          kubeconfigPath,
        ],
        { timeout: NODE_CLI_TIMEOUT_MS }
      );
    });

    it('should use custom namespace when specified', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'ns yaml', stderr: '' });
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.install(kubeconfigPath, 'custom-ns');

      expect(mockExecFile).toHaveBeenCalledWith(
        'kubectl',
        expect.arrayContaining(['create', 'namespace', 'custom-ns']),
        expect.objectContaining({ timeout: NODE_CLI_TIMEOUT_MS })
      );
    });

    it('should throw KubectlError on failure', async () => {
      const error = new Error('connection refused') as NodeJS.ErrnoException;
      mockExecFile.mockRejectedValueOnce(error);

      await expect(service.install(kubeconfigPath)).rejects.toThrow(KubectlError);
    });

    it('should throw KubectlError with BINARY_NOT_FOUND for ENOENT', async () => {
      const error = new Error('spawn kubectl ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFile.mockRejectedValueOnce(error);

      await expect(service.install(kubeconfigPath)).rejects.toMatchObject({
        code: KubectlErrorCode.BINARY_NOT_FOUND,
      });
    });

    it('should bound each install() call with NODE_CLI_TIMEOUT_MS so a hung kubectl call fails cleanly', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'ns yaml', stderr: '' });
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // Simulate what Node's execFile produces when its native `timeout` option
      // kills the child process on the manifest-apply step: killed=true, a
      // signal, no exit code.
      const timeoutError = new Error('Command failed: kubectl apply') as Error & {
        killed: boolean;
        signal: string;
        code: null;
      };
      timeoutError.killed = true;
      timeoutError.signal = 'SIGTERM';
      timeoutError.code = null;
      mockExecFile.mockRejectedValueOnce(timeoutError);

      await expect(service.install(kubeconfigPath)).rejects.toThrow(KubectlError);
    });
  });

  describe('getStatus', () => {
    it('should return installed status with pod count', async () => {
      const response = {
        items: [
          {
            metadata: { name: 'argocd-server-abc123' },
            status: { phase: 'Running', containerStatuses: [{ ready: true }] },
          },
          {
            metadata: { name: 'argocd-repo-server-def456' },
            status: { phase: 'Running', containerStatuses: [{ ready: true }] },
          },
        ],
      };
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(response), stderr: '' });

      const status = await service.getStatus(kubeconfigPath);

      expect(status).toEqual({
        installed: true,
        podCount: 2,
        serverReady: true,
      });
    });

    it('should return not installed when no pods found', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '{"items":[]}', stderr: '' });

      const status = await service.getStatus(kubeconfigPath);

      expect(status).toEqual({
        installed: false,
        podCount: 0,
        serverReady: false,
      });
    });

    it('should return fallback status on error', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('namespace not found'));

      const status = await service.getStatus(kubeconfigPath);

      expect(status).toEqual({
        installed: false,
        podCount: 0,
        serverReady: false,
      });
    });

    it('should detect server not ready', async () => {
      const response = {
        items: [
          {
            metadata: { name: 'argocd-server-abc123' },
            status: { phase: 'Pending', containerStatuses: [{ ready: false }] },
          },
        ],
      };
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(response), stderr: '' });

      const status = await service.getStatus(kubeconfigPath);

      expect(status.serverReady).toBe(false);
      expect(status.installed).toBe(true);
    });
  });

  describe('createApp', () => {
    it('should apply ArgoCD Application manifest via kubectl', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.createApp(
        kubeconfigPath,
        'my-app',
        'https://github.com/org/repo.git',
        'k8s/manifests'
      );

      expect(mockExecFile).toHaveBeenCalledWith(
        'kubectl',
        ['apply', '-f', '-', '--kubeconfig', kubeconfigPath],
        expect.objectContaining({
          input: expect.stringContaining('"kind":"Application"'),
        })
      );
    });

    it('should include correct app spec in manifest', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.createApp(kubeconfigPath, 'my-app', 'https://github.com/org/repo.git', 'k8s/');

      const callArgs = mockExecFile.mock.calls[0];
      const options = callArgs[2] as { input: string };
      const manifest = JSON.parse(options.input);

      expect(manifest.metadata.name).toBe('my-app');
      expect(manifest.metadata.namespace).toBe('argocd');
      expect(manifest.spec.source.repoURL).toBe('https://github.com/org/repo.git');
      expect(manifest.spec.source.path).toBe('k8s/');
    });
  });

  describe('syncApp', () => {
    it('should annotate the application to trigger sync', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.syncApp(kubeconfigPath, 'my-app');

      expect(mockExecFile).toHaveBeenCalledWith('kubectl', [
        'annotate',
        'application',
        'my-app',
        'argocd.argoproj.io/refresh=hard',
        '--overwrite',
        '-n',
        'argocd',
        '--kubeconfig',
        kubeconfigPath,
      ]);
    });

    it('should throw KubectlError on failure', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('application not found'));

      await expect(service.syncApp(kubeconfigPath, 'missing-app')).rejects.toThrow(KubectlError);
    });
  });
});
