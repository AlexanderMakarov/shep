# TUI Design System

Styling and UX patterns for Shep AI terminal prompts.

## Theme Integration

The TUI layer shares the CLI design system colors, ensuring visual consistency between command output and interactive prompts.

### Shep Theme

```typescript
import { colors, symbols } from '@/presentation/cli/ui';

export const shepTheme = {
  prefix: {
    idle: colors.brand('?'),
    done: colors.success(symbols.tick),
  },
  style: {
    highlight: (text: string) => colors.brand(text),
    disabled: (text: string) => colors.muted(text),
    description: (text: string) => colors.muted(text),
    answer: (text: string) => colors.accent(text),
  },
};
```

## Prompt Patterns

### Select with Disabled Options

Used for lists where some options are not yet available. A choice with a
`disabled` string is rendered dimmed and cannot be selected; the string is shown
to the user as the reason.

```typescript
import { select } from '@inquirer/prompts';

const choice = await select({
  message: 'Select your AI coding agent',
  choices: [
    { name: 'Claude Code', value: 'claude-code', description: 'Anthropic AI coding assistant' },
    { name: 'Gemini CLI', value: 'gemini-cli', description: 'Google Gemini CLI agent' },
    { name: 'Aider', value: 'aider', disabled: '(Coming Soon)' },
  ],
  theme: shepTheme,
});
```

**Do not hand-write the agent list.** `src/presentation/tui/prompts/agent-select.prompt.ts`
builds its choices from `listAgentDescriptors()` — the domain agent catalog at
`packages/core/src/domain/shared/agent-catalog.ts` — so a newly supported agent
appears automatically and nothing can silently omit one. The catalog currently
yields twelve selectable agents, in catalog order:

| Agent          | Value          | Kind |
| -------------- | -------------- | ---- |
| Claude Code    | `claude-code`  | cli  |
| Kimi Code      | `kimi-code`    | cli  |
| Codex CLI      | `codex-cli`    | cli  |
| Copilot CLI    | `copilot-cli`  | cli  |
| Cursor CLI     | `cursor`       | cli  |
| Gemini CLI     | `gemini-cli`   | cli  |
| Cline          | `cline`        | cli  |
| OpenRouter     | `openrouter`   | sdk  |
| Together AI    | `together-ai`  | sdk  |
| Ollama         | `ollama`       | sdk  |
| LLM Proxy      | `llmproxy`     | sdk  |
| Demo           | `dev`          | mock |

Two further enum members — **Aider** (`aider`) and **Continue** (`continue`) —
carry `supported: false` in the catalog and are rendered disabled with a
`(Coming Soon)` badge.

### Masked Password Input

Used for sensitive data like API tokens:

```typescript
import { password } from '@inquirer/prompts';

const token = await password({
  message: 'Enter your API token',
  mask: '*',
  theme: shepTheme,
});
```

### Confirmation

Used before destructive or irreversible operations:

```typescript
import { confirm } from '@inquirer/prompts';

const proceed = await confirm({
  message: 'Overwrite existing agent configuration?',
  default: false,
  theme: shepTheme,
});
```

## UX Guidelines

1. **Clear messages**: Prompt messages should be concise action-oriented questions
2. **Descriptions**: Use `description` field on select choices to provide context
3. **Disabled feedback**: Always include a reason string for disabled options (e.g., `'(Coming Soon)'`)
4. **Separators**: Use separators to visually group related options
5. **Defaults**: Set sensible defaults to minimize keystrokes for common paths
6. **Masking**: Always mask sensitive inputs (tokens, passwords)
7. **Confirmation**: Prompt before overwriting existing configuration

## Color Mapping

| Element                   | Color            | CLI Equivalent   |
| ------------------------- | ---------------- | ---------------- |
| Active/highlighted option | `colors.brand`   | Brand blue       |
| Disabled option text      | `colors.muted`   | Dim gray         |
| Description text          | `colors.muted`   | Dim gray         |
| Success prefix            | `colors.success` | Green            |
| Selected answer           | `colors.accent`  | Cyan             |
| Separator                 | Default          | Terminal default |

---

## Maintaining This Document

**Update when:**

- New prompt patterns are introduced
- Theme colors or symbols change
- UX guidelines evolve
