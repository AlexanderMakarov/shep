# Development Documentation

Guides for developing and contributing to Shep AI CLI.

## Contents

| Document                                               | Description                             |
| ------------------------------------------------------ | --------------------------------------- |
| [setup.md](./setup.md)                                 | Development environment setup           |
| [tdd-guide.md](./tdd-guide.md)                         | TDD methodology with Clean Architecture |
| [spec-driven-workflow.md](./spec-driven-workflow.md)   | Shep-kit spec-driven development flow   |
| [implementation-guide.md](./implementation-guide.md)   | Implementation discipline and patterns  |
| [testing.md](./testing.md)                             | Testing strategy and commands           |
| [building.md](./building.md)                           | Build process and tooling               |
| [cicd.md](./cicd.md)                                   | CI/CD pipeline and Docker setup         |
| [typespec-guide.md](./typespec-guide.md)               | TypeSpec domain modeling guide          |
| [adding-agent-types.md](./adding-agent-types.md)       | Adding a new agent provider             |
| [adding-agent-nodes.md](./adding-agent-nodes.md)       | Adding a new LangGraph agent node       |
| [feature-yaml-protocol.md](./feature-yaml-protocol.md) | feature.yaml status tracking protocol   |
| [web-component-library.md](./web-component-library.md) | Web UI component library reference      |
| [shep-kit-reference.md](./shep-kit-reference.md)       | Shep-kit skills complete reference      |
| [contributing-with-shep.md](./contributing-with-shep.md) | Contributing to Shep using Shep itself |
| [dev-server-run-plan.md](./dev-server-run-plan.md)     | Dev-server run plans (`.shep/dev.json`) |
| [messaging-local-setup.md](./messaging-local-setup.md) | Messaging remote control, local setup   |

## Quick Start for Contributors

Requires **Node 22+** and **pnpm 10+**.

```bash
# Clone repository
git clone https://github.com/shep-ai/shep.git
cd shep

# Install dependencies
pnpm install

# Build the CLI (alias for build:cli; use build:release for CLI + web)
pnpm build

# Run tests
pnpm test

# Start CLI in development mode
pnpm dev:cli

# Start Web UI in development mode
pnpm dev:web
```

## Development Workflow

1. **Setup** - Configure your development environment
2. **Branch** - Create a feature branch from `main`
3. **Develop** - Write code following architecture guidelines
4. **Test** - Ensure all tests pass
5. **Lint** - Check code style
6. **Commit** - Use conventional commits
7. **PR** - Open pull request for review

## Key Guidelines

- Follow [Clean Architecture](../architecture/clean-architecture.md) principles
- Write tests for new functionality (TDD mandatory)
- Keep commits atomic and well-described
- Update documentation for user-facing changes
- All features start with `/shep-kit:new-feature`, then
  `/shep-kit:research → /shep-kit:plan → /shep-kit:implement → /shep-kit:commit-pr`

## Related Documents

- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Contribution guidelines
- [Architecture docs](../architecture/) - System design
- [CLAUDE.md](../../CLAUDE.md) - AI tooling guidance

---

## Maintaining This Directory

**Update when:**

- Development workflow changes
- New tooling is adopted
- Setup process changes

**File naming:**

- Use kebab-case
- Be descriptive
- Match process names
