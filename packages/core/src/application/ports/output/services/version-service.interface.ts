/**
 * Version Service Interface
 *
 * Output port for reading package version information.
 * Infrastructure layer provides concrete implementation.
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { BuildIdentity } from '../../../../domain/value-objects/build-identity.js';
import type { VersionInfo } from '../../../../domain/value-objects/version-info.js';

/**
 * Port interface for reading version information.
 *
 * Implementations must:
 * - Read version info from the package manifest (package.json)
 * - Return sensible defaults when the manifest cannot be read
 */
export interface IVersionService {
  /**
   * Get version information for the package.
   *
   * @returns Version info with name, version, and description
   */
  getVersion(): VersionInfo;

  /**
   * Get the full build identity — CLI version, Node version, OS platform /
   * release / arch and the commit SHA when one can be determined.
   *
   * Separate from {@link getVersion} because a bug report needs the
   * runtime, not just the package: `shep doctor` prints this at the top.
   *
   * @returns Build identity; fields degrade rather than throw
   */
  getBuildIdentity(): BuildIdentity;
}
