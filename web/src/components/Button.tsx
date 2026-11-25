// 按钮：对外保持原有 variant/size/loading 契约，内部改用 Fluent UI v9 的 Button。
//
// 之所以不直接把 Fluent Button 暴露给页面：22 个页面都在用这里的 4 种语义变体
// （primary/secondary/danger/ghost）和 loading 态，改动调用方收益为零、风险不小。
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {
  Button as FluentButton,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const useStyles = makeStyles({
  root: {
    whiteSpace: 'nowrap',
  },
  // Fluent v9 没有 danger 语义的 appearance，用品牌色变体 + 危险色令牌实现
  danger: {
    backgroundColor: tokens.colorStatusDangerBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': {
      backgroundColor: tokens.colorStatusDangerBackground3Hover,
      color: tokens.colorNeutralForegroundOnBrand,
    },
    ':hover:active': {
      backgroundColor: tokens.colorStatusDangerBackground3Pressed,
      color: tokens.colorNeutralForegroundOnBrand,
    },
  },
});

const APPEARANCE: Record<Variant, 'primary' | 'secondary' | 'subtle'> = {
  primary: 'primary',
  secondary: 'secondary',
  danger: 'primary',
  ghost: 'subtle',
};

const FLUENT_SIZE: Record<Size, 'small' | 'medium'> = {
  sm: 'small',
  md: 'medium',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** 提交中：按钮禁用并显示转圈，用于防重复点击 */
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const styles = useStyles();

  return (
    <FluentButton
      {...rest}
      type={type}
      appearance={APPEARANCE[variant]}
      size={FLUENT_SIZE[size]}
      disabled={disabled || loading}
      className={mergeClasses(
        styles.root,
        variant === 'danger' && styles.danger,
        className ?? '',
      )}
      icon={loading ? <Spinner size="extra-tiny" /> : undefined}
    >
      {children}
    </FluentButton>
  );
}
