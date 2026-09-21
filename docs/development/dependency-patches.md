# Dependency security patches

The following patches are installed through `pnpm.patchedDependencies` and pinned
by hashes in `pnpm-lock.yaml`. Keep them until an upstream release fixes the same
behavior, then remove the patch and rerun its regression tests before upgrading.

| Package | Advisory | Local repair |
| --- | --- | --- |
| `extract-zip@2.0.1` | [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv), [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | Validate symlink targets and existing ancestors before creating directories; reject writes through symlink destinations, using `O_NOFOLLOW` where supported. |
| `@typespec/openapi3@0.60.0` | [GHSA-2q42-4q24-7rgv](https://github.com/advisories/GHSA-2q42-4q24-7rgv), also attributed to `@typespec/compiler` | Reject version values containing path separators, null bytes or traversal components before interpolating the emitter's output filename. |

All three advisories had no published patched version when checked on
2026-09-20. The OpenAPI repair covers the vulnerable emitter-to-compiler call
path, so a separate compiler patch is unnecessary. Custom executable emitters
remain trusted build tools with filesystem access.

Run the isolated regressions with:

```sh
pnpm exec vitest run tests/integration/security/dependency-path-traversal.test.ts
```

The tests cover malicious ZIP targets, duplicate archive names, existing and
dangling symlinks, directory traversal, valid internal links, and hostile and
valid TypeSpec versions. Archive fixtures write only in temporary directories;
TypeSpec uses its in-memory test host.

`pnpm audit` still reports four package/version matches because it does not inspect
local patch behavior. These entries are not suppressed. Review the patches and
passing regressions together with the raw audit output; a version match alone
does not verify whether a local patch is present. A frozen-lockfile install must
apply both patches successfully.
