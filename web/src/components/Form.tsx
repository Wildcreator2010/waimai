// 表单控件：对外契约不变（Field/Input/Textarea/Select/Switch），内部改用 Fluent UI v9。
//
// 三个刻意的取舍：
// 1) Field 不用 Fluent 的 label 槽位。Fluent v9 的 Field 没有 htmlFor，靠克隆子控件自动关联；
//    而本仓库 7 个页面都显式写了 htmlFor + 对应 id。这里自己渲染 <label htmlFor>，
//    关联是确定的，Field 只负责 hint / 校验文案的呈现。
// 2) Select 保持原生 <select>。Fluent 的 Dropdown 是 options/onOptionSelect 异步 API，
//    而调用方都按 event.target.value 写，替换要改 4 个页面且收益仅为外观。
//    改为按 Fluent 规范（4px 圆角 + 中性描边）重排原生 select 样式。
// 3) 校验态描边用内联 style 注入 Fluent 令牌，而不是 makeStyles —— 内联样式优先级稳定，
//    不会被运行时注入的原子类覆盖。
import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import {
  Field as FluentField,
  Input as FluentInput,
  Switch as FluentSwitch,
  Textarea as FluentTextarea,
  tokens,
} from '@fluentui/react-components';
import { cn } from '@/lib/utils';

/** Fluent Input 支持的 type 子集（原生 checkbox/radio/file 等不支持，需要时用原生 <input>） */
type SupportedInputType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'url'
  | 'number'
  | 'search'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'month'
  | 'week';

const CONTROL_BASE =
  'block w-full rounded border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

function controlClass(invalid?: boolean): string {
  return cn(
    CONTROL_BASE,
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100',
  );
}

function invalidStyle(invalid?: boolean, style?: CSSProperties): CSSProperties | undefined {
  if (!invalid && !style) return undefined;
  return {
    ...style,
    ...(invalid ? { borderColor: tokens.colorStatusDangerBorder1 } : null),
  };
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** 表单字段容器：标签 + 控件 + 提示 / 错误 */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <FluentField
      className={className}
      hint={hint}
      validationMessage={error}
      validationState={error ? 'error' : undefined}
    >
      <div className="space-y-1.5">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </label>
        {children}
      </div>
    </FluentField>
  );
}

export interface InputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'size' | 'children' | 'value' | 'defaultValue' | 'type'
  > {
  invalid?: boolean;
  value?: string;
  defaultValue?: string;
  type?: SupportedInputType;
}

export function Input({ invalid, className, style, ...rest }: InputProps) {
  return (
    <FluentInput
      {...rest}
      aria-invalid={invalid ? true : undefined}
      style={invalidStyle(invalid, style)}
      className={className}
    />
  );
}

export interface TextareaProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'children' | 'value' | 'defaultValue'
  > {
  invalid?: boolean;
  value?: string;
  defaultValue?: string;
}

export function Textarea({ invalid, className, style, ...rest }: TextareaProps) {
  return (
    <FluentTextarea
      {...rest}
      aria-invalid={invalid ? true : undefined}
      style={invalidStyle(invalid, style)}
      className={className}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select className={cn(controlClass(invalid), 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** 开关：用于 showNotifyDetails / smsEnabled / ntfyEnabled 这类布尔设置 */
export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <FluentSwitch
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(_event, data) => onChange(data.checked)}
      />
    </div>
  );
}
