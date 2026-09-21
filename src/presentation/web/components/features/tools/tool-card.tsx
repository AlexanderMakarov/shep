'use client';

import { useState, useTransition } from 'react';
import {
  Loader2,
  Rocket,
  Download,
  Monitor,
  Terminal,
  GitBranch,
  CircleX,
  Circle,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ToolDetailDrawer } from './tool-detail-drawer';
import type { ToolItem } from '@shepai/core/application/use-cases/tools/list-tools.use-case';
import { listAgentDescriptors } from '@shepai/core/domain/shared/agent-catalog';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';

export interface ToolCardProps {
  tool: ToolItem;
  onRefresh?: () => Promise<void>;
  className?: string;
}

const TAG_CONFIG: Record<string, { label: string; icon: typeof Monitor }> = {
  ide: { label: 'IDE', icon: Monitor },
  'cli-agent': { label: 'CLI Agent', icon: Terminal },
  vcs: { label: 'VCS', icon: GitBranch },
  terminal: { label: 'Terminal', icon: Terminal },
};

export function ToolCard({ tool, onRefresh, className }: ToolCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [autoStartInstall, setAutoStartInstall] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [imageFailed, setImageFailed] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const agent = listAgentDescriptors().find((entry) => entry.toolId === tool.id);
  const AgentIcon = agent ? getAgentTypeIcon(agent.type) : null;

  const isInstalled = tool.status.status === 'available';
  const isError = tool.status.status === 'error';
  const canLaunch = isInstalled && Boolean(tool.openDirectory);

  function handleLaunch(e: React.MouseEvent) {
    e.stopPropagation();
    setLaunchError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/tools/${tool.id}/launch`, { method: 'POST' });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error ?? `Could not launch ${tool.name}. Try again.`);
        }
      } catch (error) {
        setLaunchError(error instanceof Error ? error.message : `Could not launch ${tool.name}.`);
      }
    });
  }

  function handleCardClick() {
    setAutoStartInstall(false);
    setDrawerOpen(true);
  }

  function handleInstallClick(e: React.MouseEvent) {
    e.stopPropagation();
    setAutoStartInstall(tool.autoInstall);
    setDrawerOpen(true);
  }

  return (
    <>
      <div
        data-testid="tool-card"
        className={cn(
          'bg-card group relative flex min-h-30 w-full flex-col rounded-lg border p-3 transition-shadow hover:shadow-md',
          className
        )}
      >
        {/* Top row: icon + name left, tag badges right */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {AgentIcon ? (
              <AgentIcon aria-hidden className="size-5" />
            ) : tool.iconUrl && !imageFailed ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={tool.iconUrl}
                alt=""
                width={20}
                height={20}
                onError={() => setImageFailed(true)}
                className="shrink-0 dark:invert"
              />
            ) : (
              <Package className="text-muted-foreground h-5 w-5 shrink-0" />
            )}
            <h2 data-testid="tool-card-name" className="min-w-0 truncate text-sm font-bold">
              <button
                type="button"
                onClick={handleCardClick}
                className="focus-visible:after:ring-ring cursor-pointer text-start outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-offset-2"
              >
                {tool.name}
              </button>
            </h2>
          </div>
          <div data-testid="tool-card-tags" className="flex shrink-0 items-center gap-1">
            {tool.tags.map((tag) => {
              const config = TAG_CONFIG[tag] ?? { label: tag, icon: Monitor };
              const TagIcon = config.icon;
              return (
                <span
                  key={tag}
                  className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px]"
                >
                  <TagIcon className="h-2.5 w-2.5" />
                  {config.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <p data-testid="tool-card-summary" className="text-muted-foreground mt-1 truncate text-xs">
          {tool.summary}
        </p>

        {/* Bottom section — pushed to bottom */}
        <div className="mt-auto flex items-center justify-between pt-3">
          {/* Status text */}
          <div className="flex items-center gap-2">
            {isError && tool.status.status === 'error' ? (
              <span
                className="flex items-center gap-1 truncate text-[10px] text-red-600 dark:text-red-400"
                title={tool.status.errorMessage}
              >
                <CircleX className="h-3 w-3 shrink-0" />
                {tool.status.errorMessage ?? 'Error'}
              </span>
            ) : isInstalled ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Installed
              </span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                <Circle className="h-3 w-3" />
                Not installed
              </span>
            )}
            {tool.required ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                      Required
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    This tool is required for Shep to function properly
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>

          {/* Action buttons */}
          <div className="relative z-10 flex items-center gap-1">
            {isInstalled && canLaunch ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLaunch}
                disabled={isPending}
                aria-label={`Launch ${tool.name}`}
                data-testid="tool-card-launch-button"
                className="h-7 cursor-pointer rounded-md px-3 text-xs"
              >
                {isPending ? (
                  <Loader2 className="me-1 h-3 w-3 animate-spin" />
                ) : (
                  <Rocket className="me-1 h-3 w-3" />
                )}
                Launch
              </Button>
            ) : !isInstalled && !isError ? (
              <Button
                size="sm"
                variant="default"
                onClick={handleInstallClick}
                aria-label={`Install ${tool.name}`}
                data-testid="tool-card-install-button"
                className="h-7 cursor-pointer rounded-md px-3 text-xs"
              >
                <Download className="me-1 h-3 w-3" />
                Install
              </Button>
            ) : null}
          </div>
        </div>
        {launchError ? (
          <p role="alert" className="text-destructive relative mt-2 text-xs">
            {launchError}
          </p>
        ) : null}
      </div>

      <ToolDetailDrawer
        tool={tool}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRefresh={onRefresh}
        autoStart={autoStartInstall}
      />
    </>
  );
}
