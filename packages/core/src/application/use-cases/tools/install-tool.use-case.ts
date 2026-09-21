/**
 * InstallToolUseCase
 *
 * Executes the installation of a tool with live output streaming support.
 * Returns detailed status information about the installation result.
 *
 * Installation runs the catalogue's shell command for the tool (several are
 * `curl … | bash`), so the `autoInstall` gate lives HERE rather than in any
 * one caller: the CLI, the web route and the MCP surface all go through this
 * use case, and only one of them used to check the flag.
 */

import { injectable, inject } from 'tsyringe';
import type { ToolInstallationStatus } from '../../../domain/generated/output.js';
import { createErrorStatus } from '../../../domain/value-objects/tool-installation-status.js';
import type { IToolInstallerService } from '../../ports/output/services/index.js';
import type { IToolMetadataProvider } from '../../ports/output/services/tool-metadata-provider.interface.js';

/** Tools omit `autoInstall` when automated installation is fine. */
const AUTO_INSTALL_DEFAULT = true;

@injectable()
export class InstallToolUseCase {
  constructor(
    @inject('IToolInstallerService')
    private readonly toolInstallerService: IToolInstallerService,
    @inject('IToolMetadataProvider')
    private readonly toolMetadata: IToolMetadataProvider
  ) {}

  /**
   * Executes installation of a tool with optional output streaming.
   *
   * @param toolName - Name of the tool to install
   * @param onOutput - Optional callback for streaming installation output
   * @returns Status information about the installation result
   */
  async execute(
    toolName: string,
    onOutput?: (data: string) => void
  ): Promise<ToolInstallationStatus> {
    const metadata = this.toolMetadata.getToolById(toolName);

    if (!metadata) {
      return createErrorStatus(toolName, `Unknown tool: ${toolName}`);
    }

    if ((metadata.autoInstall ?? AUTO_INSTALL_DEFAULT) === false) {
      return createErrorStatus(
        toolName,
        `${metadata.name} does not support automated installation. ` +
          `Install it manually: ${metadata.documentationUrl}`
      );
    }

    return this.toolInstallerService.executeInstall(toolName, onOutput);
  }
}
