'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  FolderOpen,
  Github,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/common/empty-state';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import { ControlCenterEmptyState } from '@/components/features/control-center/control-center-empty-state';
import { ApplicationCard } from './application-card';
import { listDeployments } from '@/app/actions/list-deployments';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';

export interface ApplicationsPageClientProps {
  className?: string;
}

/**
 * Status buckets offered as filters.
 *
 * "Needs attention" is the one that earns its place: it answers the only
 * question a user opens this page in a hurry to ask, and it spans two
 * underlying statuses, so a raw status list could not express it.
 */
const STATUS_FILTERS = [
  { id: 'all', label: 'All applications', icon: LayoutGrid, matches: () => true },
  {
    id: 'attention',
    label: 'Needs attention',
    icon: TriangleAlert,
    matches: (s?: string) => s === 'failed' || s === 'interrupted',
  },
  { id: 'ready', label: 'Ready', icon: CheckCircle2, matches: (s?: string) => s === 'ready' },
  { id: 'building', label: 'Building', icon: Zap, matches: (s?: string) => s === 'building' },
] as const;

type StatusFilterId = (typeof STATUS_FILTERS)[number]['id'];

/** Case- and whitespace-insensitive match over the fields a user would type. */
function matchesSearch(app: ApplicationWithStatus, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return [app.name, app.description, app.repositoryPath]
    .filter((field): field is string => typeof field === 'string')
    .some((field) => field.toLowerCase().includes(needle));
}

interface NewApplicationCardProps {
  importing?: boolean;
  onDescribe(): void;
  onOpenLocalDirectory?: () => void;
  onImportGitHub?: () => void;
}

export function ApplicationsPageClient({ className }: ApplicationsPageClientProps) {
  const router = useRouter();
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>('all');

  const {
    data: applications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ApplicationWithStatus[]>({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetch('/api/applications');
      if (!res.ok) throw new Error('Failed to fetch applications');
      return res.json();
    },
    staleTime: 30_000,
    // This list has no SSE subscription (unlike the control-center canvas),
    // so a user watching the tab while an app is created/updated in the
    // background would otherwise only see it after a manual reload.
    refetchInterval: 15_000,
  });

  // Live dev-server deployments — seeds the DeploymentStatusProvider so the
  // app cards reflect previews started on /application/[id] (or another tab)
  // instead of resetting every time this page mounts. Without this seed the
  // provider's `fullyHydrated` flag (set by the empty SSR hydrate) blocks
  // each card's `ensureHydrated` from fetching, leaving previews invisible.
  const { data: deployments = [] } = useQuery<DeploymentStatusEntry[]>({
    queryKey: ['deployments', 'all'],
    queryFn: () => listDeployments(),
    staleTime: 0,
    refetchInterval: 10_000,
  });

  const sorted = useMemo(
    () =>
      [...applications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [applications]
  );

  const counts = useMemo(
    () => ({
      all: sorted.length,
      ready: sorted.filter((app) => app.effectiveStatus === 'ready').length,
      building: sorted.filter((app) => app.effectiveStatus === 'building').length,
      attention: sorted.filter((app) => ['failed', 'interrupted'].includes(app.effectiveStatus))
        .length,
    }),
    [sorted]
  );

  const openLocalProject = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const { pickFolder } = await import('@/components/common/add-repository-button/pick-folder');
      const path = await pickFolder();
      if (!path) return;
      const { adoptLocalDirectory } = await import('@/app/actions/adopt-local-directory');
      const result = await adoptLocalDirectory({ repositoryPath: path });
      if (!result.applicationId)
        throw new Error(result.error ?? 'The project could not be imported.');
      router.push(`/application/${result.applicationId}`);
    } catch (error) {
      toast.error('Could not open project', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setImporting(false);
    }
  };

  // A failed query and a genuinely empty account are NOT the same thing.
  // Treating them the same put the first-run wizard in front of users who
  // already have applications every time the daemon hiccuped, and the 15s
  // refetch re-ran that every 15 seconds. `sorted` still holds the last
  // successful response during a background failure, so only the
  // nothing-to-show case gets the full error panel; a failed refresh over
  // an existing list shows the list plus a staleness warning.
  const loadFailedWithNothingToShow = isError && sorted.length === 0;
  const refreshFailedOverExistingList = isError && sorted.length > 0;

  const activeStatus = STATUS_FILTERS.find((f) => f.id === statusFilter) ?? STATUS_FILTERS[0];
  const visible = useMemo(
    () =>
      sorted.filter(
        (app) => activeStatus.matches(app.effectiveStatus) && matchesSearch(app, search)
      ),
    [sorted, activeStatus, search]
  );
  // Filtered-to-nothing is NOT an empty account — the no-matches panel below
  // is shown instead of the first-run wizard, which would otherwise tell a
  // user who has applications that they have none.

  return (
    <DeploymentStatusProvider initialDeployments={deployments}>
      <div
        data-testid="applications-page-client"
        className={cn('bg-background relative isolate flex min-h-full min-w-0 flex-col', className)}
      >
        {/* Content sits inside padding; the create-prompt overlay sits
            OUTSIDE this inner padded div so it can cover edge-to-edge. */}
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-7 p-4 sm:p-6 lg:p-10">
          <header className="border-border/60 relative overflow-hidden rounded-2xl border bg-linear-to-br from-blue-50/80 via-transparent to-transparent p-6 sm:p-8 dark:from-blue-950/30">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full border border-blue-500/10"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-8 -right-8 size-48 rounded-full border border-blue-500/10"
            />
            <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div className="min-w-0 space-y-3">
                <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-widest uppercase">
                  <LayoutGrid className="size-3.5" aria-hidden="true" />
                  Your workspace
                </div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Applications</h1>
                <p className="text-muted-foreground max-w-lg text-sm leading-relaxed sm:text-base">
                  From the first idea to your next release. Build something great.
                </p>
              </div>
              {!isLoading && sorted.length > 0 ? (
                <Button
                  size="lg"
                  className="h-11 shrink-0 rounded-xl shadow-sm"
                  onClick={() => setShowCreatePrompt(true)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New application
                </Button>
              ) : null}
            </div>
          </header>

          {isLoading ? (
            <div className="flex items-center justify-center py-12" role="status">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              <span className="sr-only">Loading applications</span>
            </div>
          ) : loadFailedWithNothingToShow ? (
            <div
              className="flex flex-1 items-center justify-center"
              data-testid="applications-error"
              role="alert"
            >
              <EmptyState
                icon={<TriangleAlert className="text-destructive h-8 w-8" aria-hidden="true" />}
                title="Couldn't load your applications"
                description="Shep couldn't reach the local daemon, so this list is unavailable. Nothing has been deleted."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void refetch()}
                    data-testid="applications-retry"
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Retry
                  </Button>
                }
              />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <ControlCenterEmptyState
                onApplicationCreated={(appId) => {
                  router.push(`/application/${appId}`);
                }}
              />
            </div>
          ) : (
            <>
              {refreshFailedOverExistingList ? (
                <div
                  data-testid="applications-stale-warning"
                  role="status"
                  className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">
                    Couldn&apos;t refresh — showing the last list Shep was able to read.
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => void refetch()}
                    data-testid="applications-stale-retry"
                  >
                    Retry
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div
                    role="group"
                    aria-label="Filter applications by status"
                    className="flex flex-wrap gap-1.5"
                  >
                    {STATUS_FILTERS.map(({ id, label, icon: Icon }) => (
                      <Button
                        key={id}
                        variant={statusFilter === id ? 'secondary' : 'ghost'}
                        aria-pressed={statusFilter === id}
                        onClick={() => setStatusFilter(id)}
                        className={cn(
                          'h-10 gap-2 rounded-lg px-3 text-xs',
                          statusFilter === id && 'ring-border ring-1'
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                        {label}
                        <span className="text-muted-foreground font-mono text-xs tabular-nums">
                          {counts[id]}
                        </span>
                      </Button>
                    ))}
                  </div>
                  <div className="relative w-full lg:max-w-xs">
                    <Search
                      aria-hidden="true"
                      className="text-muted-foreground pointer-events-none absolute top-3.5 left-3.5 size-4"
                    />
                    <Input
                      type="search"
                      aria-label="Search applications"
                      placeholder="Search applications…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-11 rounded-xl ps-10 pe-10 [&::-webkit-search-cancel-button]:appearance-none"
                    />
                    {search ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Clear search"
                        onClick={() => setSearch('')}
                        className="absolute end-1 top-1 size-9 rounded-lg"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className="text-muted-foreground text-xs"
                >
                  {visible.length === sorted.length
                    ? `${sorted.length} ${sorted.length === 1 ? 'application' : 'applications'}`
                    : `${visible.length} of ${sorted.length} applications`}
                </p>
              </div>
              {visible.length === 0 ? (
                <div className="border-border/60 rounded-2xl border border-dashed py-10">
                  <EmptyState
                    icon={<Search className="size-7" aria-hidden="true" />}
                    title="No matching applications"
                    description="Try a different name or clear your filters to see every application."
                    action={
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch('');
                          setStatusFilter('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div
                  data-testid="applications-page-grid"
                  className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                >
                  <NewApplicationCard
                    onDescribe={() => setShowCreatePrompt(true)}
                    importing={importing}
                    onOpenLocalDirectory={() => void openLocalProject()}
                    onImportGitHub={() =>
                      window.dispatchEvent(new CustomEvent('shep:open-github-import'))
                    }
                  />
                  {visible.map((app) => (
                    <ApplicationCard key={app.id} application={app} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Edge-to-edge create-prompt overlay. `absolute` (not `fixed`)
            so it stays contained within the page's relative root and
            never covers the AppsOnlyShell top bar. Sibling of the padded
            content div so it ignores the list's `p-6`. */}
        {showCreatePrompt ? (
          <div className="absolute inset-0 z-40">
            <ControlCenterEmptyState
              onApplicationCreated={(appId) => {
                router.push(`/application/${appId}`);
              }}
              onClose={() => setShowCreatePrompt(false)}
              className="bg-background"
            />
          </div>
        ) : null}
      </div>
    </DeploymentStatusProvider>
  );
}

/** Creation choices stay visible for mouse, keyboard and touch users. */
function NewApplicationCard({
  onDescribe,
  onOpenLocalDirectory,
  onImportGitHub,
  importing,
}: NewApplicationCardProps) {
  const options = [
    {
      icon: Sparkles,
      label: 'Describe with AI',
      description: 'Start with an idea',
      onClick: onDescribe,
    },
    {
      icon: FolderOpen,
      label: 'Open local project',
      description: 'Continue from a folder',
      onClick: onOpenLocalDirectory,
    },
    {
      icon: Github,
      label: 'Import from GitHub',
      description: 'Bring an existing repository',
      onClick: onImportGitHub,
    },
  ];
  return (
    <section
      aria-label="Create an application"
      className="border-primary/25 bg-primary/[0.025] flex min-h-[320px] flex-col rounded-xl border border-dashed p-5"
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
          <Plus className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Make room for your next idea</h2>
          <p className="text-muted-foreground mt-1 text-xs">Three ways to get started.</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-2">
        {options
          .filter((option) => option.onClick)
          .map(({ icon: Icon, label, description, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              disabled={label === 'Open local project' && importing}
              className="border-border/60 bg-card hover:border-primary/35 hover:bg-primary/5 focus-visible:ring-ring group flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-60"
            >
              {label === 'Open local project' && importing ? (
                <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <Icon className="text-primary size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{label}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs">{description}</span>
              </span>
              <ArrowUpRight
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden="true"
              />
            </button>
          ))}
      </div>
    </section>
  );
}
