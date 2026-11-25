// 登录态：access token 在内存，refresh 在 httpOnly cookie。
// 冷启动时若存在会话标记，用 cookie 换一次 access token，再拉 /auth/me。

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshAccessToken, setAccessToken, setAuthLostHandler } from '@/lib/api';
import { clearSessionHint, hasSessionHint, markSessionHint } from '@/lib/session';
import type { AuthResponse, Role, User } from '@/lib/types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  isAdmin: boolean;
  isRoot: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** 重新拉一次 /auth/me（例如管理员改了自己的设置后） */
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function hasAdminRole(role: Role | undefined): boolean {
  return role === 'ADMIN' || role === 'ROOT';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // 冷启动：有会话标记才尝试刷新，避免每次开页都吃一个 401
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!hasSessionHint()) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) {
        clearSessionHint();
        setStatus('anonymous');
        return;
      }
      try {
        const me = await api.get<User>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        clearSessionHint();
        setAccessToken(null);
        setStatus('anonymous');
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // 刷新失败时由 api 层回调：清空内存令牌、清缓存，路由守卫随后跳 /login
  useEffect(() => {
    setAuthLostHandler(() => {
      clearSessionHint();
      setUser(null);
      setStatus('anonymous');
      queryClient.clear();
    });
    return () => setAuthLostHandler(null);
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<AuthResponse>('/auth/login', { email, password });
      setAccessToken(res.accessToken);
      markSessionHint();
      // 换账号后不能复用上一个账号的缓存
      queryClient.clear();
      setUser(res.user);
      setStatus('authenticated');
      return res.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post<void>('/auth/logout');
    } catch {
      // 服务端撤销失败也要清本地，否则用户会卡在登录态
    }
    setAccessToken(null);
    clearSessionHint();
    queryClient.clear();
    setUser(null);
    setStatus('anonymous');
  }, [queryClient]);

  const reloadUser = useCallback(async () => {
    const me = await api.get<User>('/auth/me');
    setUser(me);
    setStatus('authenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAdmin: hasAdminRole(user?.role),
      isRoot: user?.role === 'ROOT',
      login,
      logout,
      reloadUser,
    }),
    [user, status, login, logout, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
