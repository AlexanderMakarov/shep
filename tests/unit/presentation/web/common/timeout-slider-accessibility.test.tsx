import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TimeoutSlider } from '@/components/features/settings/timeout-slider';

describe('timeout slider accessibility', () => {
  it('announces its label and duration and supports keyboard adjustment', async () => {
    const onChange = vi.fn();
    render(
      <>
        <label id="timeout-analyze-label">Analyze timeout</label>
        <TimeoutSlider
          id="timeout-analyze"
          testId="timeout"
          value="1800"
          onChange={onChange}
          onBlur={vi.fn()}
        />
      </>
    );
    const slider = screen.getByRole('slider', { name: 'Analyze timeout' });
    expect(slider).toHaveAttribute('aria-valuetext', '30m');
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('2700');
  });
});
