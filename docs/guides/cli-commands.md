# CLI Commands Reference

Quick reference for the Shep AI CLI commands you will reach for day to day. For the full surface,
see [docs/cli/commands.md](../cli/commands.md).

## Daemon Commands

### `shep`

Start the Shep daemon (default action). Equivalent to `shep start` with no flags: it spawns the
background web server, prints the control-center URL, and opens it in your browser. If a daemon is
already running it just prints the existing URL.

```bash
shep
```

Initial setup happens in the browser, not the terminal — see
[getting-started.md](./getting-started.md).

### `shep start`

Start the background service.

```bash
shep start
shep start --port 8080     # -p, --port <number>
```

### `shep stop`

Stop the background service.

```bash
shep stop
```

### `shep restart`

Restart the background service.

```bash
shep restart
```

### `shep status`

Show the current status of the background service.

```bash
shep status
```

### `shep ui`

Run the web UI in the foreground (same process as the CLI) instead of as a daemon.

```bash
shep ui
shep ui --port 8080
shep ui --no-open          # don't open a browser
```

## Feature Commands

### `shep feat`

Manage features.

| Subcommand                              | Description                                       |
| --------------------------------------- | ------------------------------------------------- |
| `shep feat new <description>`           | Create a new feature                              |
| `shep feat ls`                          | List features                                     |
| `shep feat show <id>`                   | Show feature details                              |
| `shep feat start <id>`                  | Start a pending feature (spawn the agent)         |
| `shep feat resume <id>`                 | Resume a feature                                  |
| `shep feat logs <id>`                   | View feature logs                                 |
| `shep feat review [id]`                 | Interactive review of a feature awaiting approval |
| `shep feat approve [id]`                | Approve the current gate                          |
| `shep feat reject [id] --reason <text>` | Reject the current gate (`--reason` is required)  |
| `shep feat feedback <id> <feedback>`    | Send feedback on an exploration prototype         |
| `shep feat promote <id>`                | Promote an exploration feature to Regular/Fast    |
| `shep feat adopt <branch>`              | Adopt an existing branch as a feature             |
| `shep feat archive <id>`                | Archive a feature                                 |
| `shep feat unarchive <id>`              | Restore an archived feature                       |
| `shep feat del <id>`                    | Delete a feature                                  |

Common flags:

- `shep feat new` — `-r, --repo <path>`, `--remote <url>`, `--push`, `--pr` / `--no-pr`,
  `--allow-prd`, `--allow-plan`, `--allow-merge`, `--allow-all`, `--parent <fid>`, `--pending`,
  `--fast` / `--no-fast`, `--explore`, `--model <model>`, `--no-rebase`,
  `--inject-skills` / `--no-inject-skills`, `--attach <path>` (repeatable).
  `--allow-all` sets only the three spec/merge gates — it does not imply `--push` or `--pr`, and
  `--explore` and `--fast` are mutually exclusive.
- `shep feat ls` — `-r, --repo <path>`, `--include-deleted`, `--show-archived`
- `shep feat logs` — `-f, --follow`, `-n, --lines <count>`
- `shep feat del` — `-f, --force`, `--no-cleanup`, `--no-close-pr`

```bash
shep feat new "Add OAuth login" --allow-prd --pr
shep feat approve
shep feat reject --reason "Use magic links instead"
shep feat logs 001 --follow
```

## Agent Commands

### `shep agent`

Manage running agents.

| Subcommand                                 | Description                                    |
| ------------------------------------------ | ---------------------------------------------- |
| `shep agent ls`                            | List agents                                    |
| `shep agent show <id>`                     | Show agent details                             |
| `shep agent stop <id>`                     | Stop a running agent                           |
| `shep agent logs <id>`                     | View agent logs (`-f`, `-n <count>`)           |
| `shep agent delete <id>`                   | Delete an agent (`--force`)                    |
| `shep agent approve <id>`                  | Approve an agent action                        |
| `shep agent reject <id>`                   | Reject an agent action (`-r, --reason <text>`) |
| `shep agent questions ls`                  | List open agent questions                      |
| `shep agent questions answer <questionId>` | Answer a question                              |
| `shep agent questions cancel <questionId>` | Cancel a question                              |

`shep agent message send` also exists but is a dev-only helper for the inter-agent message bus; it
is hidden from `--help` outside dev mode.

## Repository Commands

### `shep repo`

Manage repositories.

| Subcommand                     | Description                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `shep repo ls`                 | List tracked repositories                                                                            |
| `shep repo show <id>`          | Show repository details                                                                              |
| `shep repo import <dir>`       | Bulk-import local folders (`<dir>` is the **parent** directory; `--all`, `--git-only`)               |
| `shep repo add`                | Clone and register a GitHub repository (`--url <url>`, `--dest <path>`; interactive without `--url`) |
| `shep repo init-remote [name]` | Create a GitHub repo from the current local one (`--public`, `--org <name>`)                         |

## Session Commands

### `shep session`

Manage and view agent provider CLI sessions.

| Subcommand               | Description          |
| ------------------------ | -------------------- |
| `shep session ls`        | List sessions        |
| `shep session show <id>` | Show session details |

Both accept `--claude-code`, `--cursor-cli`, `--gemini-cli` to choose the source; `ls` also takes
`-n, --limit <n>` and `--flat`, and `show` takes `-m, --messages <n>`.

## Settings Commands

### `shep settings`

Manage global application settings. Running `shep settings` without a subcommand launches the
interactive setup wizard. See [configuration.md](./configuration.md) for the detail.

| Subcommand                      | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `shep settings`                 | Launch interactive settings wizard                |
| `shep settings show`            | Display current settings (`-o table\|json\|yaml`) |
| `shep settings init`            | Reset settings to defaults (`-f, --force`)        |
| `shep settings agent`           | Configure agent type and auth                     |
| `shep settings ide`             | Configure IDE preference (`--editor <name>`)      |
| `shep settings workflow`        | Configure workflow defaults                       |
| `shep settings model`           | Configure the default LLM model                   |
| `shep settings adaptive-models` | Configure per-task adaptive model tiers           |
| `shep settings language`        | Configure display language                        |
| `shep settings messaging`       | Configure Telegram / WhatsApp remote control      |
| `shep settings worktree`        | Configure custom worktree provisioning commands   |

`shep settings agent` requires `--auth` whenever `--agent` is given (except for `dev`):

```bash
shep settings agent --agent claude-code --auth session
shep settings agent --agent openrouter --auth token --token sk-xxx
```

## Tool Commands

| Command               | Description                                                               |
| --------------------- | ------------------------------------------------------------------------- |
| `shep tools list`     | List tools and their installation status                                  |
| `shep install [tool]` | Install a tool (no argument lists them; `--how` prints instructions only) |
| `shep ide <feat-id>`  | Open a feature's worktree in your editor                                  |

`shep ide` defaults to the editor saved by `shep settings ide`, and accepts a per-invocation
override flag named after each known editor (`--vscode`, `--cursor`, `--zed`, …). Run
`shep ide --help` for the list this version supports.

## Other Commands

### `shep run <agent-name>`

Run an AI agent workflow against a repository. `analyze-repository` performs a standalone
structure, dependency, and architecture pass.

```bash
shep run analyze-repository
shep run analyze-repository --prompt "Focus on security"
shep run analyze-repository --repo /path/to/repo
shep run analyze-repository --stream
```

Options: `-p, --prompt <prompt>`, `-r, --repo <path>`, `-s, --stream`.

### `shep doctor`

Diagnose the local Shep contributor environment.

```bash
shep doctor
```

### `shep version`

Show version information.

```bash
shep version
```

### `shep upgrade`

Upgrade the Shep CLI to the latest version.

```bash
shep upgrade
```

### More

`shep --help` lists the full command surface. Beyond the commands above it also includes
`shep app`, `shep aspm`, `shep bedrock`, `shep cluster`, `shep contributors`, `shep cycle`,
`shep dev`, `shep fleet`, `shep intake`, `shep item`, `shep mcp`, `shep notifications`,
`shep plugin`, `shep project`, `shep review`, `shep security`, `shep supervisor`,
`shep whatsapp` and `shep workflow`. Each supports `--help` of its own.

---

## Maintaining This Document

**Update when:**

- New commands are added
- Command options change
- Subcommands are added or removed

**Related docs:**

- [docs/cli/commands.md](../cli/commands.md) - Detailed command documentation
- [getting-started.md](./getting-started.md) - Basic usage
- [configuration.md](./configuration.md) - Settings and environment variables
