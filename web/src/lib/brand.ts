/**
 * 品牌名：构建时通过 VITE_APP_NAME 注入，未配置时回落到默认名称。
 * 与 server 的 APP_NAME 保持相同值即可让前后端与邮件标题一致。
 */
export const APP_NAME = (import.meta.env.VITE_APP_NAME ?? '').trim() || '取餐提醒';

/** 用于 Logo 方块的首字（中文取第一个字，英文取首字母）。 */
export const APP_INITIAL = APP_NAME.slice(0, 1);
