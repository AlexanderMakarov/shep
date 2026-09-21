import type { ComponentType, SVGProps } from 'react';
import { createBrandIcon } from '@/components/common/brand-icon';
import { Code, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

/** Fallback icon for unknown editor types. */
function DefaultEditorIcon(props: IconProps) {
  return <Code className={cn('h-4 w-4', props.className)} {...(props as object)} />;
}

const VsCodeIcon = createBrandIcon('/icons/editors/vscode.svg', 'VS Code');
const CursorEditorIcon = createBrandIcon('/icons/agents/cursor.jpeg', 'Cursor');
const WindsurfIcon = createBrandIcon('/icons/editors/windsurf.svg', 'Windsurf', true);
const ZedIcon = createBrandIcon('/icons/editors/zed.svg', 'Zed', true);

function AntigravityIcon({ className, ...props }: IconProps) {
  return <Rocket className={cn('h-4 w-4', className)} {...(props as object)} />;
}
AntigravityIcon.displayName = 'AntigravityIcon';

const editorTypeIconMap: Record<string, ComponentType<IconProps>> = {
  vscode: VsCodeIcon,
  cursor: CursorEditorIcon,
  windsurf: WindsurfIcon,
  zed: ZedIcon,
  antigravity: AntigravityIcon,
};

/** Resolve an editor type string to its corresponding icon component. */
export function getEditorTypeIcon(editorType?: string): ComponentType<IconProps> {
  if (editorType && editorType in editorTypeIconMap) {
    return editorTypeIconMap[editorType];
  }
  return DefaultEditorIcon;
}
