// 统一 REST 客户端。
//
// 约定（docs/api.md §0、§7）：
// - access token 只存内存（模块变量），不落 localStorage / sessionStorage；
// - Web 端 refresh 走 httpOnly cookie，请求 body 为空；
// - 401 TOKEN_EXPIRED 自动 POST /auth/refresh 后重试一次，失败则回到未登录态（由路由守卫跳 /login）；
// - 所有失败统一抛 ApiError { code, message, status, details }。

import type { AuthResponse } from './types';

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '/api').replace(/\/+$/, '');

/** 后端未给出 code 时的兜底中文文案（按 docs/api.md §0.1 错误码表） */
const CODE_TEXT: Record<string, string> = {
  VALIDATION_FAILED: '参数不合法',
  UNAUTHENTICATED: '请先登录',
  TOKEN_EXPIRED: '登录已过期，请重新登录',
  FORBIDDEN: '没有权限执行该操作',
  EMAIL_NOT_VERIFIED: '邮箱尚未验证',
  ACCOUNT_DISABLED: '账号已被停用',
  NOT_FOUND: '资源不存在',
  EMAIL_TAKEN: '该邮箱已被注册',
  INVITE_USED: '邀请码已被使用',
  TOO_MANY_REQUESTS: '操作过于频繁，请稍后再试',
  INTERNAL: '服务端错误，请稍后再试',
  INVALID_SETUP_CODE: '引导码错误',
  ALREADY_BOOTSTRAPPED: '已完成引导，引导入口已关闭',
  INVALID_CREDENTIALS: '邮箱或密码错误',
  REFRESH_INVALID: '登录状态已失效，请重新登录',
  REFRESH_EXPIRED: '登录已过期，请重新登录',
  REFRESH_REVOKED: '登录状态已被撤销，请重新登录',
  INVITE_INVALID: '邀请码无效',
  INVITE_EXPIRED: '邀请码已过期',
  INVITE_EMAIL_MISMATCH: '邀请码与邮箱不匹配',
  INVITE_EMAIL_PENDING: '该邮箱已有未使用的邀请码',
  TOKEN_INVALID: '链接无效或已使用',
  CODE_INVALID: '验证码错误',
  CODE_EXPIRED: '验证码已过期',
  PHONE_TAKEN: '该手机号已被其他账号绑定',
  TOO_MANY_ACTIVE_REMINDERS: '等待中的任务已达上限',
  NETWORK_ERROR: '网络请求失败，请检查网络或服务端是否已启动',
};

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'INTERNAL';
  }
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** 页面统一取错误文案：优先后端 message，其次按 code 的兜底文案 */
export function errorText(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (err instanceof ApiError) {
    return err.message || CODE_TEXT[err.code] || fallback;
  }
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}

/** 取错误码，便于页面按 code 分支（如 PHONE_NOT_BOUND、INVITE_EXPIRED） */
export function errorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}

// ---------------------------------------------------------------- 内存态 access token

let accessToken: string | null = null;
let authLostHandler: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * 注册「登录态丢失」回调：AuthProvider 用它把用户置为未登录，
 * 之后路由守卫自然跳到 /login（不使用 window.location，避免整页刷新）。
 */
export function setAuthLostHandler(handler: (() => void) | null): void {
  authLostHandler = handler;
}

/**
 * 下载文件（如 CSV 导出）。
 *
 * access token 只在内存里，不能用 <a href> 直接下载，必须带 Authorization 取回 blob 再触发保存。
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const attempt = () =>
    fetch(`${API_BASE}${path}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      credentials: 'include',
    });

  let res = await attempt();
  if (res.status === 401) {
    const next = await refreshAccessToken();
    if (next) res = await attempt();
  }
  if (!res.ok) {
    throw new ApiError('DOWNLOAD_FAILED', `下载失败（HTTP ${res.status}）`, res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- 请求

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** 是否附带 Authorization（默认 true） */
  auth?: boolean;
  /** 内部用：禁止再触发刷新，避免递归 */
  allowRefresh?: boolean;
}

async function rawRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
  }
  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      // Web 端 refresh cookie 是 httpOnly，必须带上凭据
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', CODE_TEXT.NETWORK_ERROR, 0);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    const code = payload.code ?? codeForStatus(res.status);
    const message = payload.message || CODE_TEXT[code] || `请求失败（HTTP ${res.status}）`;
    throw new ApiError(code, message, res.status, payload.details ?? null);
  }

  return data as T;
}

/** 单飞刷新：并发 401 只发一次 /auth/refresh */
let refreshInFlight: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const task = (async (): Promise<string | null> => {
    try {
      // Web 端：空 body + httpOnly cookie
      const data = await rawRequest<AuthResponse>('/auth/refresh', { method: 'POST', auth: false });
      accessToken = data.accessToken ?? null;
      return accessToken;
    } catch {
      accessToken = null;
      return null;
    }
  })();

  refreshInFlight = task;
  void task.finally(() => {
    if (refreshInFlight === task) refreshInFlight = null;
  });
  return task;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, opts);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;

    const isAuthFailure =
      err.status === 401 && (err.code === 'TOKEN_EXPIRED' || err.code === 'UNAUTHENTICATED');
    const canRetry =
      isAuthFailure &&
      opts.auth !== false &&
      opts.allowRefresh !== false &&
      !path.startsWith('/auth/refresh') &&
      !path.startsWith('/auth/login');

    if (!canRetry) throw err;

    const token = await refreshAccessToken();
    if (!token) {
      accessToken = null;
      authLostHandler?.();
      throw err;
    }

    // 只重试一次
    return await rawRequest<T>(path, { ...opts, allowRefresh: false });
  }
}

/** 把对象拼成 query string，跳过 undefined / 空串 */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
