// 卡片：对外保持 Card / CardHeader 契约，内部改用 Fluent UI v9 的 Card。
import type { ReactNode } from 'react';
import {
  Card as FluentCard,
  CardHeader as FluentCardHeader,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  // Fluent 的 filled 卡片没有描边；这里补一条中性描边，与原有视觉层次一致
  root: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  header: {
    width: '100%',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
  },
});

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <FluentCard
      appearance="filled"
      size="medium"
      className={mergeClasses(styles.root, className ?? '')}
    >
      {children}
    </FluentCard>
  );
}

export interface CardHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  const styles = useStyles();
  return (
    <FluentCardHeader
      className={mergeClasses(styles.header, className ?? '')}
      header={
        <Text weight="semibold" size={400}>
          {title}
        </Text>
      }
      description={
        description ? (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {description}
          </Text>
        ) : undefined
      }
      action={actions ? <div className={styles.actions}>{actions}</div> : undefined}
    />
  );
}
