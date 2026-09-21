import type { Meta, StoryObj } from '@storybook/react';
import { createBrandIcon } from './brand-icon';

const Monochrome = createBrandIcon('/icons/agents/openai.svg', 'OpenAI', true);
const Color = createBrandIcon('/icons/agents/claude-ai-icon.svg', 'Claude Code');

export default {
  title: 'Common/BrandIcon',
  parameters: { layout: 'centered' },
} satisfies Meta;

export const BothThemes: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {['light', 'dark'].map((theme) => (
        <div key={theme} className={theme}>
          <div className="bg-background text-foreground flex gap-4 rounded-xl border p-6">
            <Monochrome className="size-10" />
            <Color className="size-10" />
          </div>
        </div>
      ))}
    </div>
  ),
};
