# Building Guide

Guide to building Shep AI CLI for development and distribution.

## Build System

Shep uses the **TypeScript compiler (`tsc`)** with `tsc-alias` for building:

- Standard TypeScript compilation via `tsconfig.build.json`
- Path alias resolution via `tsc-alias`
- Web UI built separately with Next.js and copied to `web/` for distribution

## Build Commands

### Development Build

```bash
# Start the web dev server
pnpm dev

# Or run CLI and web separately
pnpm dev:cli    # Run CLI via tsx
pnpm dev:web    # Start Next.js dev server
```

### Production Build

```bash
# CLI only — the fast one, and what you want during development
pnpm build

# CLI + generated types + production web bundle — what CI and packaging run
pnpm build:release
```

`pnpm build` is an alias for `pnpm build:cli`; it does **not** build the web UI.
Output goes to `dist/` (mirroring the repo structure with compiled `.js` files).

### Type Checking

```bash
# Check types without emitting
pnpm typecheck
```

There is no `typecheck:watch` script. For continuous feedback use your editor's
TypeScript server, or `pnpm exec tsc --noEmit --watch`.

## Build Targets

| Script                  | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `build`                 | Alias for `build:cli`                                                    |
| `build:cli`             | `tsc` + `tsc-alias` into `dist/`, then copies runtime assets (see below) |
| `build:release`         | `generate` → `build:cli` → `build:web:prod`                              |
| `build:web`             | `pnpm --filter @shepai/web build` (Next.js build in place)               |
| `build:web:prod`        | `build:web`, then assembles the distributable `web/` bundle              |
| `build:storybook`       | `storybook build` (the Storybook Build CI job)                           |
| `electron:compile`      | Compile the Electron sources (`scripts/build.mjs`), no packaging          |
| `electron:build`        | Same as `electron:build:linux` (the package's `build` targets linux)     |
| `electron:build:mac`    | Package for macOS                                                        |
| `electron:build:win`    | Package for Windows                                                      |
| `electron:build:linux`  | Package for Linux                                                        |

## Build Pipeline

`pnpm build:cli` runs:

1. **`tsc -p tsconfig.build.json`** — compiles TypeScript to JavaScript in `dist/`
2. **`tsc-alias -p tsconfig.build.json --resolve-full-paths`** — rewrites the
   `@/`, `@shepai/core` and `@domain/` path aliases to real relative paths
3. **asset copies** (via `shx`) — the compiler only emits `.js`, so the build then
   copies the non-TypeScript files the CLI loads at runtime:
   - `packages/core/src/infrastructure/services/tool-installer/tools/` (tool
     installer JSON descriptors)
   - `packages/core/src/infrastructure/templates/vite-shadcn-base/`
   - `translations/` (i18n bundles)

`pnpm build:release` wraps that with `pnpm generate` in front (so the TypeSpec
output is current) and `pnpm build:web:prod` after (Next.js build, then the
standalone bundle assembled into `web/`).

## TypeScript Configuration

The root `tsconfig.json` is the single project config; `tsconfig.build.json`
extends it and only flips what emitting requires:

```json
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": false,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "packages/core/src/**/*", "types/**/*"],
  "exclude": [
    "node_modules",
    "dist",
    "tsp",
    "apis",
    "**/*.test.ts",
    "**/*.spec.ts",
    "packages/core/src/infrastructure/templates/**",
    "src/presentation/web/**"
  ]
}
```

Two exclusions are deliberate and documented in the file itself: the Next.js app
is shipped as a prebuilt bundle in `web/`, so compiling it into `dist/` only added
dead weight, and `.d.ts.map` files pointed at `src/`, which the published tarball
does not ship.

`rootDir` is the repository root, not `src/` — that is why the output is
`dist/src/...` and `dist/packages/core/src/...`.

## Build Outputs

### Compiled JavaScript

Output goes to `dist/` mirroring the `src/` directory structure:

```
dist/
├── src/
│   ├── presentation/
│   │   ├── cli/         # CLI entry point
│   │   ├── tui/         # TUI components
│   │   └── web/         # Web server integration
│   └── ...
└── packages/
    └── core/
        └── src/         # Core business logic
```

### Web UI Output

The Next.js web UI is built separately and copied to `web/` for distribution:

```
web/                     # Pre-built Next.js output (in .gitignore)
```

## CLI Executable

Package.json bin configuration:

```json
{
  "bin": {
    "shep": "./dist/src/presentation/cli/index.js"
  }
}
```

## Dependencies

Runtime dependencies (`dependencies`) and build tooling (`devDependencies`) are
declared in `package.json`; read it there rather than trusting a copy in this
document. The shape worth knowing:

- **Runtime** — `commander` (CLI), `better-sqlite3` + `umzug` (persistence),
  `tsyringe` + `reflect-metadata` (DI), `@langchain/langgraph` (feature agent),
  `next` + `react` (web UI), `node-pty`, `ws`, `zod`.
- **Build/dev only** — `typescript`, `tsc-alias`, `tsx`, `shx`, `vitest`,
  `@playwright/test`, `storybook`, `eslint`, `prettier`, `@typespec/compiler`
  and the TypeSpec emitters, `semantic-release`.

`pnpm.onlyBuiltDependencies` restricts which packages may run install scripts:
`better-sqlite3`, `cloudflared`, `electron`, `electron-winstaller`, `esbuild`,
`node-pty`, `sharp`.

## Native Modules

`better-sqlite3` and `node-pty` are native addons and must match the running
Node ABI:

```bash
# Rebuild for the current platform / Node version
pnpm rebuild better-sqlite3
```

A `postinstall` script, `scripts/verify-native-bindings.mjs`, probes
`better-sqlite3` after every install, makes one rebuild attempt if it fails to
load, and prints guidance. It always exits 0 so a probe hiccup can never brick an
install; `connection.ts` raises the clear runtime error if it could not recover.

## Build Scripts

### Clean Build

```bash
pnpm reset:dev && pnpm build
```

`clean:dev` removes `dist`, `web`, `.next`, `src/presentation/web/.next` **and
`node_modules`**, so it always needs an install after it — which is exactly what
`reset:dev` (`clean:dev` then `pnpm install`) does. Reach for it after switching
between branches with different dependencies, or after a Docker build left
Linux-built `node_modules` in the checkout. There is no `pnpm clean`.

### Package for npm

```bash
pnpm build:release
npm pack
```

The `files` field ships `apis`, `dist`, `web`, `scripts/verify-native-bindings.mjs`,
`README.md` and `LICENSE` — so the web bundle must exist, which is why packaging
uses `build:release` rather than `build`.

### Publish

Publishing is automated by semantic-release on `main` (see
[cicd.md](./cicd.md)); it is not run by hand.

## Build Optimization

### Declarations and Source Maps

`tsconfig.build.json` emits `.d.ts` files but sets `declarationMap: false`: the
maps point at `src/`, which the published tarball does not contain, so they were
megabytes of dead links.

## Debugging Builds

### Check Output Size

```bash
pnpm build
du -sh dist/*
```

## Continuous Integration

There is no separate build or release workflow — everything lives in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), which runs on pushes
and pull requests targeting `main` and `develop` on Node 22.

The jobs that exercise the build:

| Job                         | Runs                                                   |
| --------------------------- | ------------------------------------------------------ |
| Type Check                  | `pnpm generate`, a staleness check, then `pnpm typecheck` |
| E2E CLI (ubuntu, windows)   | `pnpm build:release`, then `pnpm test:e2e:cli`         |
| E2E (TUI) / E2E (Web)       | `pnpm build:release`, then the matching suite          |
| Storybook Build             | `pnpm check:stories`, then `pnpm build:storybook`      |
| Electron (mac/win/linux)    | Packages the desktop installers                        |
| Release (main only)         | semantic-release → npm publish + GitHub release        |

The Type Check job re-runs `pnpm generate` and then fails if
`packages/core/src/domain/generated` or `apis` differ from what was committed, so
generated output must be committed alongside the `.tsp` change that produced it.

See [cicd.md](./cicd.md) for the full pipeline.

---

## Maintaining This Document

**Update when:**

- Build tooling changes
- TypeScript configuration changes
- New build targets added
- Dependency requirements change

**Related docs:**

- [setup.md](./setup.md) - Development setup
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Release process
