import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettingsSave } from '@/hooks/use-settings-save';
import { updateSettingsAction } from '@/app/actions/update-settings';
import { toast } from 'sonner';

vi.mock('@/app/actions/update-settings', () => ({ updateSettingsAction: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('Settings save feedback', () => {
  it('never reports Saved when the action returns a failure', async () => {
    vi.mocked(updateSettingsAction).mockResolvedValue({ success: false, error: 'Storage full' });
    const { result } = renderHook(() => useSettingsSave());
    await act(async () => result.current.save({ language: 'en' }));
    expect(toast.error).toHaveBeenCalledWith('Storage full');
    expect(result.current.showSaved).toBe(false);
    expect(result.current.showSaving).toBe(false);
  });

  it('handles rejected network requests without leaving the indicator pending', async () => {
    vi.mocked(updateSettingsAction).mockRejectedValue(new Error('Network unavailable'));
    const { result } = renderHook(() => useSettingsSave());
    await act(async () => result.current.save({ language: 'en' }));
    expect(toast.error).toHaveBeenCalledWith('Network unavailable');
    expect(result.current.showSaved).toBe(false);
    expect(result.current.showSaving).toBe(false);
  });

  it('keeps a failed overlapping save from being masked by another success', async () => {
    let finish!: (value: { success: boolean }) => void;
    vi.mocked(updateSettingsAction)
      .mockResolvedValueOnce({ success: false, error: 'Storage full' })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
    const { result } = renderHook(() => useSettingsSave());
    act(() => {
      result.current.save({ language: 'en' });
      result.current.save({ shell: 'bash' });
    });
    expect(result.current.showSaving).toBe(true);
    await act(async () => finish({ success: true }));
    await waitFor(() => expect(result.current.showSaving).toBe(false));
    expect(result.current.showSaved).toBe(false);
  });

  it('announces a successful save and clears its timer on unmount', async () => {
    vi.useFakeTimers();
    vi.mocked(updateSettingsAction).mockResolvedValue({ success: true });
    const { result, unmount } = renderHook(() => useSettingsSave());
    await act(async () => result.current.save({ language: 'en' }));
    expect(result.current.showSaved).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
