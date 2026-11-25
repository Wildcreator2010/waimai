// Fluent UI 主题：以现有 Tailwind 品牌蓝 #2563eb（brand-600）为基准生成 Fluent 品牌色阶。
//
// 为什么要自定义而不是直接用 webLightTheme：Fluent 默认品牌色是 #0f6cbd，
// 而页面里大量 Tailwind 类（bg-brand-600 / text-brand-700 / ring-brand-100）用的是 #2563eb。
// 两套色值并存会让「Fluent 按钮」和「Tailwind 链接」看起来是两个产品。
// 这里让 Fluent 的品牌色阶从 #2563eb 派生，两边自动一致。
import { createLightTheme } from '@fluentui/react-components';
import type { BrandVariants, Theme } from '@fluentui/react-components';

const BRAND: BrandVariants = {
  10: '#f5f9ff',
  20: '#e8f1ff',
  30: '#d5e6ff',
  40: '#bfd9ff',
  50: '#a5c9fd',
  60: '#89b6fb',
  70: '#6ba1f8',
  80: '#4c8bf5',
  90: '#2563eb',
  100: '#1d4ed8',
  110: '#1a45c4',
  120: '#163aa6',
  130: '#122f88',
  140: '#0e2569',
  150: '#0a1b4c',
  160: '#071230',
};

export const mealLightTheme: Theme = createLightTheme(BRAND);
