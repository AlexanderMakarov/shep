'use client';

import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/hooks/use-hydrated';

export interface SettingsSectionNavProps {
  sections: readonly { id: string; labelKey: string; icon: LucideIcon }[];
  activeSection: string;
  onSelect: (id: string) => void;
}

export function SettingsSectionNav({ sections, activeSection, onSelect }: SettingsSectionNavProps) {
  const { t } = useTranslation('web');
  const hydrated = useHydrated();
  return (
    <nav
      tabIndex={0}
      aria-label={t('settings.title')}
      className="flex min-w-0 gap-1 overflow-x-auto pb-1"
    >
      {sections.map(({ id, labelKey, icon: Icon }) => (
        <button
          key={id}
          type="button"
          disabled={!hydrated}
          aria-controls={`section-${id}`}
          aria-current={activeSection === id ? 'location' : undefined}
          onClick={() => onSelect(id)}
          className={cn(
            'focus-visible:ring-ring flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset',
            activeSection === id
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <Icon aria-hidden className="size-3.5 shrink-0" />
          {t(labelKey)}
        </button>
      ))}
    </nav>
  );
}
