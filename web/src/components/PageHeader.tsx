// 页面标题：对外契约不变，内部改用 Fluent UI v9 的 Text 排版令牌。
import type { ReactNode } from 'react';
import { Text } from '@fluentui/react-components';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Text as="h1" size={600} weight="semibold" block>
          {title}
        </Text>
        {description ? (
          <Text as="p" size={300} className="mt-1 block text-slate-500">
            {description}
          </Text>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
