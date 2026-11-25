// 加载 / 空态 / 错误态 / 提示条：所有请求页面共用。内部改用 Fluent UI v9。
import type { ReactNode } from 'react';
import {
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Spinner as FluentSpinner,
} from '@fluentui/react-components';
import { errorText } from '@/lib/api';
import { Button } from '@/components/Button';

export function Spinner({ className }: { className?: string }) {
  return <FluentSpinner size="tiny" className={className} />;
}

export function LoadingBlock({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <FluentSpinner size="tiny" label={text} />
      <span>{text}</span>
    </div>
  );
}

export function FullPageLoading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <LoadingBlock text={text} />
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <MessageBar intent="error" layout="multiline" politeness="assertive" className={className}>
      <MessageBarBody>{errorText(error, '加载失败，请重试')}</MessageBarBody>
      {onRetry ? (
        <MessageBarActions>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            重试
          </Button>
        </MessageBarActions>
      ) : null}
    </MessageBar>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="max-w-md text-xs text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

type BannerTone = 'info' | 'warn' | 'error' | 'success';

const BANNER_INTENT: Record<BannerTone, 'info' | 'warning' | 'error' | 'success'> = {
  info: 'info',
  warn: 'warning',
  error: 'error',
  success: 'success',
};

export function AlertBanner({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const assertive = tone === 'error' || tone === 'warn';
  return (
    <MessageBar
      intent={BANNER_INTENT[tone]}
      layout="multiline"
      politeness={assertive ? 'assertive' : 'polite'}
      className={className}
    >
      <MessageBarBody>
        {title ? <MessageBarTitle>{title}</MessageBarTitle> : null}
        {children}
      </MessageBarBody>
    </MessageBar>
  );
}
