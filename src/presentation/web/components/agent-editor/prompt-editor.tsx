'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { saveAgentPrompt, resetAgentPrompt } from '@/app/actions/agent-prompts';

export interface PromptEditorEntry {
  agentType: string;
  promptId: string;
  name: string;
  description: string;
  bundledBody: string;
  effectiveBody: string;
  hasOverride: boolean;
}

export interface PromptEditorProps {
  entries: PromptEditorEntry[];
  /** Optional override of the save handler — used by Storybook + tests. */
  onSaveOverride?: (input: { agentType: string; promptId: string; body: string }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  onResetOverride?: (input: { agentType: string; promptId: string }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
}

export function PromptEditor({ entries, onSaveOverride, onResetOverride }: PromptEditorProps) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        No editable prompt slots are registered for this agent yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="prompt-editor">
      {entries.map((entry) => (
        <PromptSlotCard
          key={`${entry.agentType}-${entry.promptId}`}
          entry={entry}
          {...(onSaveOverride && { onSaveOverride })}
          {...(onResetOverride && { onResetOverride })}
        />
      ))}
    </div>
  );
}

function PromptSlotCard({
  entry,
  onSaveOverride,
  onResetOverride,
}: {
  entry: PromptEditorEntry;
  onSaveOverride?: PromptEditorProps['onSaveOverride'];
  onResetOverride?: PromptEditorProps['onResetOverride'];
}) {
  const [body, setBody] = useState(entry.effectiveBody);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Re-sync when server data refreshes (revalidatePath after save).
  useEffect(() => {
    setBody(entry.effectiveBody);
  }, [entry.effectiveBody]);

  const dirty = body !== entry.effectiveBody;
  const overridden = entry.hasOverride || dirty;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const fn = onSaveOverride ?? saveAgentPrompt;
      const result = await fn({ agentType: entry.agentType, promptId: entry.promptId, body });
      if (!result.ok) setError(result.error ?? 'Failed to save');
      else setSavedAt(new Date());
    });
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const fn = onResetOverride ?? resetAgentPrompt;
      const result = await fn({ agentType: entry.agentType, promptId: entry.promptId });
      if (!result.ok) setError(result.error ?? 'Failed to reset');
      else {
        setBody(entry.bundledBody);
        setSavedAt(new Date());
      }
    });
  }

  return (
    <article
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      data-testid={`prompt-slot-${entry.promptId}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={`prompt-label-${entry.promptId}`} className="text-sm font-semibold">
            {entry.name}
          </h2>
          <p className="text-muted-foreground text-xs">{entry.description}</p>
          <p className="text-muted-foreground mt-1 font-mono text-[10px]">
            {entry.agentType}/{entry.promptId}
          </p>
        </div>
        {overridden ? (
          <Badge
            variant="default"
            className="shrink-0"
            data-testid={`badge-overridden-${entry.promptId}`}
          >
            Overridden
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0">
            Bundled
          </Badge>
        )}
      </header>

      <Textarea
        aria-labelledby={`prompt-label-${entry.promptId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.min(20, Math.max(6, body.split('\n').length))}
        className="font-mono text-xs"
        data-testid={`prompt-textarea-${entry.promptId}`}
        disabled={isPending}
        spellCheck={false}
      />

      {error ? (
        <Alert variant="destructive" data-testid={`prompt-error-${entry.promptId}`}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {savedAt ? (
        <p className="text-muted-foreground text-xs" data-testid={`prompt-saved-${entry.promptId}`}>
          Saved at {savedAt.toLocaleTimeString()}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {entry.hasOverride ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={handleReset}
            data-testid={`prompt-reset-${entry.promptId}`}
          >
            Reset to bundled
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!dirty || isPending}
          onClick={handleSave}
          data-testid={`prompt-save-${entry.promptId}`}
        >
          {isPending ? 'Saving…' : entry.hasOverride ? 'Update override' : 'Save override'}
        </Button>
      </div>
    </article>
  );
}
