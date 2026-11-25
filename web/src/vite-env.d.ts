/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 前缀，默认 /api（开发期由 Vite 代理到 127.0.0.1:8787） */
  readonly VITE_API_BASE?: string;
  /** 品牌名，默认「取餐提醒」；与 server 的 APP_NAME 保持一致 */
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
