import type { ComponentType, SVGProps } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Static local artwork keeps working in packaged and authenticated servers. */
export function createBrandIcon(
  src: string,
  alt: string,
  monochrome = false
): ComponentType<SVGProps<SVGSVGElement>> {
  function BrandIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <Image
        src={src}
        alt={alt}
        width={24}
        height={24}
        unoptimized
        className={cn(
          'shrink-0 rounded-sm object-contain',
          monochrome && 'dark:invert',
          props.className
        )}
        style={props.style}
        id={props.id}
        role={props.role}
        aria-hidden={props['aria-hidden']}
        aria-label={props['aria-label']}
        aria-describedby={props['aria-describedby']}
      />
    );
  }
  BrandIcon.displayName = `BrandIcon(${alt})`;
  return BrandIcon;
}
