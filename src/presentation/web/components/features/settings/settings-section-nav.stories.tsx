import type { Meta, StoryObj } from '@storybook/react';
import { Bot, Database, Globe, Settings } from 'lucide-react';
import { fn } from '@storybook/test';
import { SettingsSectionNav } from './settings-section-nav';

const meta: Meta<typeof SettingsSectionNav> = {
  title: 'Features/Settings/SectionNav',
  component: SettingsSectionNav,
  args: {
    activeSection: 'language',
    onSelect: fn(),
    sections: [
      { id: 'language', labelKey: 'settings.sections.language', icon: Globe },
      { id: 'agent', labelKey: 'settings.sections.agent', icon: Bot },
      { id: 'workflow', labelKey: 'settings.sections.workflow', icon: Settings },
      { id: 'database', labelKey: 'settings.sections.database', icon: Database },
    ],
  },
};

export default meta;

export const Default: StoryObj<typeof SettingsSectionNav> = {};
export const Narrow: StoryObj<typeof SettingsSectionNav> = {
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};
