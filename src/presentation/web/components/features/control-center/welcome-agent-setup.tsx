'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, ChevronLeft, Loader2, RefreshCw, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getAllAgentModels } from '@/app/actions/get-all-agent-models';
import type { AgentModelGroup } from '@/app/actions/get-all-agent-models';
import { updateAgentAndModel } from '@/app/actions/update-agent-and-model';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';
import { getModelMeta } from '@/lib/model-metadata';
import { cn } from '@/lib/utils';

export interface WelcomeAgentSetupProps {
  onComplete: () => void;
  className?: string;
}

type SetupStep = 'select-agent' | 'select-model';

const STEPS: SetupStep[] = ['select-agent', 'select-model'];

const MAX_AGENT_COLUMNS = 4;
const MAX_MODEL_COLUMNS = 3;

/**
 * Build a `grid-template-columns` track list, clamped to at least one column.
 *
 * `repeat(0, …)` is invalid CSS: the browser drops the whole declaration and
 * the grid collapses, which is how a failed/empty agent load used to render a
 * first-run screen with no interactive controls at all.
 */
function gridColumns(count: number, max: number): string {
  return `repeat(${Math.max(1, Math.min(count, max))}, minmax(0, 1fr))`;
}

export function WelcomeAgentSetup({ onComplete, className }: WelcomeAgentSetupProps) {
  const { t } = useTranslation('web');
  const [groups, setGroups] = useState<AgentModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [step, setStep] = useState<SetupStep>('select-agent');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Id of the option the user activated, so only that control spins. */
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);

  const loadGroups = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    getAllAgentModels()
      .then((next) => {
        setGroups(next);
      })
      .catch(() => {
        // A rejected action used to leave `groups: []` with no error flag —
        // indistinguishable from "no agent CLI installed", and neither case
        // had a rendered branch.
        setGroups([]);
        setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (step !== previousStep.current) {
      previousStep.current = step;
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [step]);

  const activeGroup = selectedAgent ? groups.find((g) => g.agentType === selectedAgent) : null;

  const transitionTo = useCallback((nextStep: SetupStep, setup?: () => void) => {
    setTransitioning(true);
    setVisible(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setup?.();
      setStep(nextStep);
      requestAnimationFrame(() => {
        setVisible(true);
        setTransitioning(false);
      });
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const saveAndComplete = useCallback(
    async (agentType: string, model: string | null) => {
      setSaving(true);
      setPendingChoice(model ?? agentType);
      const failed = (description?: string) => {
        // A failed save used to be completely silent: the wizard simply
        // un-dimmed and the user had no idea their choice was discarded.
        toast.error(t('welcome.saveFailed', 'Could not save your agent selection.'), {
          ...(description ? { description } : {}),
        });
        setSaving(false);
        setPendingChoice(null);
      };

      try {
        const result = await updateAgentAndModel(agentType, model);
        if (!result?.ok) {
          failed(result?.error);
          return;
        }
        // Fade out the entire wizard before handing off to the next view
        setVisible(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          onComplete();
        }, 200);
      } catch (error: unknown) {
        failed(error instanceof Error ? error.message : undefined);
      }
    },
    [onComplete, t]
  );

  const handleAgentSelect = useCallback(
    (agentType: string) => {
      const group = groups.find((g) => g.agentType === agentType);
      if (group && group.models.length > 0) {
        transitionTo('select-model', () => {
          setSelectedAgent(agentType);
        });
      } else {
        saveAndComplete(agentType, null);
      }
    },
    [groups, transitionTo, saveAndComplete]
  );

  const handleModelSelect = useCallback(
    (model: string) => {
      if (!selectedAgent) return;
      saveAndComplete(selectedAgent, model);
    },
    [selectedAgent, saveAndComplete]
  );

  const handleBack = useCallback(() => {
    if (step === 'select-model') {
      transitionTo('select-agent', () => {
        setSelectedAgent(null);
      });
    }
  }, [step, transitionTo]);

  if (loading) {
    return (
      <div
        data-testid="welcome-agent-setup"
        role="status"
        className={cn('flex flex-col items-center justify-center gap-4', className)}
      >
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        <p className="text-muted-foreground text-sm">{t('welcome.loadingAgents')}</p>
      </div>
    );
  }

  // Two failure shapes, two distinct screens — both of which keep a control on
  // screen so a cold install is never stuck on a dead page.
  if (loadFailed) {
    return (
      <SetupNotice
        testId="welcome-agent-setup-error"
        className={className}
        icon={<AlertCircle className="h-6 w-6" />}
        title={t('welcome.loadFailedTitle', 'Could not load agents')}
        body={t(
          'welcome.loadFailedBody',
          'Shep could not read the list of available agents. Check that the Shep server is still running, then try again.'
        )}
        actionLabel={t('common.retry')}
        onAction={loadGroups}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <SetupNotice
        testId="welcome-agent-setup-empty"
        className={className}
        icon={<Terminal className="h-6 w-6" />}
        title={t('welcome.noAgentsTitle', 'No agent CLI found')}
        body={t(
          'welcome.noAgentsBody',
          'Shep runs your work through an agent CLI. Install one on this machine, then re-check.'
        )}
        actionLabel={t('emptyState.reCheck')}
        onAction={loadGroups}
      />
    );
  }

  const stepIndex = STEPS.indexOf(step);

  // Dynamic hero text per step
  const heroTitle = step === 'select-agent' ? t('welcome.chooseAgent') : t('welcome.pickModel');

  const heroSubtitle =
    step === 'select-agent'
      ? t('welcome.selectAgentSubtitle')
      : activeGroup
        ? t('welcome.chooseModelSubtitle', { label: activeGroup.label })
        : '';

  return (
    <div
      data-testid="welcome-agent-setup"
      className={cn('flex w-full flex-col items-center', className)}
    >
      {/* Announce the in-flight save — `aria-busy` alone is not spoken */}
      {saving ? (
        <span role="status" className="sr-only">
          {t('common.saving')}
        </span>
      ) : null}

      {/* Step indicator — stays visible across transitions */}
      <div className="mb-8 flex w-full max-w-xs items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              'h-[3px] flex-1 rounded-full transition-colors duration-300',
              i <= stepIndex ? 'bg-foreground/60' : 'bg-muted'
            )}
          />
        ))}
      </div>

      {/* Hero + content — all fade together on step transitions */}
      <div
        className={cn(
          'flex w-full flex-col items-center transition-opacity duration-200',
          visible && !transitioning ? 'opacity-100' : 'opacity-0'
        )}
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-foreground/90 text-center text-3xl font-light tracking-tight outline-none sm:text-5xl"
        >
          {heroTitle}
        </h1>
        <p className="text-muted-foreground mt-3 text-center text-lg leading-relaxed font-light">
          {heroSubtitle}
        </p>

        <div className="mt-8 flex w-full flex-col items-center">
          {/* Step 1: Agent selection — horizontal grid */}
          {step === 'select-agent' && (
            <div
              data-testid="agent-list"
              className="grid w-full max-w-lg gap-3 max-sm:grid-cols-2!"
              style={{
                gridTemplateColumns: gridColumns(groups.length, MAX_AGENT_COLUMNS),
              }}
            >
              {groups.map((group) => {
                const GroupIcon = getAgentTypeIcon(group.agentType);
                const pending = pendingChoice === group.agentType;
                return (
                  <button
                    key={group.agentType}
                    type="button"
                    disabled={saving}
                    aria-busy={saving}
                    data-testid={`agent-option-${group.agentType}`}
                    className="border-border bg-card/80 focus-visible:ring-ring hover:bg-accent hover:border-foreground/20 flex min-w-0 cursor-pointer flex-col items-center gap-3 rounded-2xl border px-3 py-5 shadow-xs transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] disabled:opacity-50 dark:bg-white/[0.035]"
                    onClick={() => handleAgentSelect(group.agentType)}
                  >
                    {pending ? (
                      <Loader2
                        data-testid="welcome-agent-setup-saving"
                        className="text-foreground/70 h-7 w-7 animate-spin"
                      />
                    ) : (
                      <GroupIcon aria-hidden className="text-foreground/70 h-7 w-7" />
                    )}
                    <span className="max-w-full text-sm font-medium wrap-break-word">
                      {group.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Model selection — horizontal grid */}
          {step === 'select-model' && activeGroup ? (
            <div
              data-testid="model-list"
              className="flex w-full max-w-lg flex-col items-center gap-4"
            >
              <button
                type="button"
                disabled={saving}
                aria-busy={saving}
                className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 self-start text-sm transition-colors disabled:opacity-50"
                onClick={handleBack}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
                {t('welcome.back')}
              </button>
              <div
                className="grid w-full gap-3 max-sm:grid-cols-1!"
                style={{
                  gridTemplateColumns: gridColumns(activeGroup.models.length, MAX_MODEL_COLUMNS),
                }}
              >
                {activeGroup.models.map((m) => {
                  const meta = getModelMeta(m.id);
                  const pending = pendingChoice === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={saving}
                      aria-busy={saving}
                      data-testid={`model-option-${m.id}`}
                      className="border-border bg-card/80 focus-visible:ring-ring hover:bg-accent hover:border-foreground/20 flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-2xl border px-3 py-5 text-center shadow-xs transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] disabled:opacity-50 dark:bg-white/[0.035]"
                      onClick={() => handleModelSelect(m.id)}
                    >
                      {pending ? (
                        <Loader2
                          data-testid="welcome-agent-setup-saving"
                          className="text-foreground/70 h-5 w-5 animate-spin"
                        />
                      ) : null}
                      <span className="max-w-full text-sm font-medium wrap-break-word">
                        {meta.displayName || m.displayName}
                      </span>
                      <span className="text-muted-foreground text-xs leading-tight">
                        {meta.description || m.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Shared shell for the two non-selectable first-run outcomes (load failed /
 * nothing installed). Both keep exactly one primary control on screen so the
 * wizard is always recoverable without a page reload.
 */
function SetupNotice({
  testId,
  icon,
  title,
  body,
  actionLabel,
  onAction,
  className,
}: {
  testId: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="welcome-agent-setup"
      className={cn('flex w-full flex-col items-center', className)}
    >
      <div
        data-testid={testId}
        role="alert"
        className="flex w-full max-w-md flex-col items-center text-center"
      >
        <div className="bg-muted text-muted-foreground mb-5 flex h-12 w-12 items-center justify-center rounded-2xl">
          {icon}
        </div>
        <h1 className="text-foreground/90 text-center text-3xl font-extralight tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground mt-3 text-center text-base leading-relaxed font-light">
          {body}
        </p>
        <button
          type="button"
          data-testid="welcome-agent-setup-retry"
          onClick={onAction}
          className="border-border hover:bg-accent hover:border-foreground/20 mt-8 flex cursor-pointer items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97]"
        >
          <RefreshCw className="h-4 w-4" />
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
