'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateSettingsAction } from '@/app/actions/update-settings';

/** Report success only after every overlapping save has succeeded. */
export function useSettingsSave() {
  const { t } = useTranslation('web');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pending = useRef(0);
  const failed = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (state !== 'saved') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const save = useCallback(
    (payload: Record<string, unknown>) => {
      if (pending.current === 0) failed.current = false;
      pending.current += 1;
      setState('saving');

      void (async () => {
        try {
          const result = await updateSettingsAction(payload);
          if (!result.success) throw new Error(result.error ?? t('settings.failedToSave'));
        } catch (error) {
          failed.current = true;
          if (mounted.current) {
            toast.error(error instanceof Error ? error.message : t('settings.failedToSave'));
          }
        } finally {
          pending.current -= 1;
          if (mounted.current && pending.current === 0) {
            setState(failed.current ? 'error' : 'saved');
          }
        }
      })();
    },
    [t]
  );

  return { save, showSaving: state === 'saving', showSaved: state === 'saved' };
}
