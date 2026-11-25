// 徽标：对外保持 tone 契约（gray/blue/green/amber/red/violet），内部改用 Fluent UI v9 的 Badge。
import type { ReactNode } from 'react';
import { Badge as FluentBadge } from '@fluentui/react-components';

export type BadgeTone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet';

const COLORS: Record<
  BadgeTone,
  'subtle' | 'informative' | 'success' | 'warning' | 'danger' | 'brand'
> = {
  gray: 'subtle',
  blue: 'informative',
  green: 'success',
  amber: 'warning',
  red: 'danger',
  violet: 'brand',
};

export function Badge({
  tone = 'gray',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <FluentBadge
      appearance="tint"
      color={COLORS[tone] ?? 'subtle'}
      size="small"
      shape="rounded"
      className={className}
    >
      {children}
    </FluentBadge>
  );
}
