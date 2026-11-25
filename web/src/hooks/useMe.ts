// 当前用户的通知设置、手机号绑定、ntfy topic、设备列表。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import type { Device, MeSettings, NtfyConfig, RotateNtfyResponse } from '@/lib/types';

export interface MeSettingsPatch {
  showNotifyDetails?: boolean;
  smsEnabled?: boolean;
  ntfyEnabled?: boolean;
}

export function useMeSettings() {
  return useQuery({
    queryKey: qk.meSettings,
    queryFn: () => api.get<MeSettings>('/me/settings'),
  });
}

export function useUpdateMeSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: MeSettingsPatch) => api.patch<MeSettings>('/me/settings', patch),
    onSuccess: (data) => {
      queryClient.setQueryData(qk.meSettings, data);
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useRequestPhoneCode() {  return useMutation({
    mutationFn: (body: { phone: string; captchaId?: string; captchaAnswer?: string }) =>
      api.post<void>('/me/phone/request-code', body),
  });
}

export function useVerifyPhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string; code: string }) =>
      api.post<void>('/me/phone/verify', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.meSettings });
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useUnbindPhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/me/phone/unbind'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.meSettings });
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useRotateNtfyTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RotateNtfyResponse>('/me/ntfy/rotate'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.meSettings });
      void queryClient.invalidateQueries({ queryKey: qk.ntfyConfig });
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useNtfyConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.ntfyConfig,
    queryFn: () => api.get<NtfyConfig>('/me/ntfy/config'),
    enabled: options?.enabled,
  });
}

export function useDevices() {
  return useQuery({
    queryKey: qk.devices,
    queryFn: () => api.get<Device[]>('/me/devices'),
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/me/devices/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.devices });
    },
  });
}

/** 修改密码：成功后服务端会作废旧会话并返回新的令牌对，前端继续用当前会话即可。 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.patch<unknown>('/auth/password', body),
  });
}

/** 注销账号：需要密码确认；ROOT 会被服务端拒绝。 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (password: string) => api.post<{ deleted: boolean }>('/me/delete', { password }),
  });
}
