import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  featureStatusConfig,
  featureStatusOrder,
  type FeatureStatus,
} from '@/components/common/feature-status-config';

export interface FeatureStatusBadgesProps {
  /** Count of features per status. */
  counts: Record<FeatureStatus, number>;
  className?: string;
}

export function FeatureStatusBadges({ counts, className }: FeatureStatusBadgesProps) {
  const { t } = useTranslation('web');
  const visibleStatuses = featureStatusOrder.filter((s) => counts[s] > 0);

  if (visibleStatuses.length === 0) return null;

  return (
    <div
      data-testid="feature-status-badges"
      className={cn('flex flex-col items-center gap-1.5 py-1', className)}
    >
      {visibleStatuses.map((status) => {
        const { icon: Icon, iconClass, bgClass, labelKey } = featureStatusConfig[status];
        return (
          <Tooltip key={status}>
            <TooltipTrigger asChild>
              {/* Each badge is its own polite live region wrapping only its own
                  count, so a feature moving Running → Error announces that one
                  status instead of re-reading the whole column. `role="status"`
                  also makes the label valid — a bare <div> is name-prohibited —
                  and the label spells the status out in words, because colour
                  and a glyph are all the badge otherwise conveys. */}
              <div
                data-testid={`feature-status-badge-${status}`}
                role="status"
                aria-live="polite"
                aria-label={`${t(labelKey)}: ${counts[status]}`}
                className={cn(
                  'flex size-8 items-center justify-center gap-0.5 rounded-md',
                  bgClass
                )}
              >
                <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', iconClass)} />
                <span className="text-[0.6rem] font-semibold tabular-nums">{counts[status]}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t(labelKey)}: {counts[status]}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
