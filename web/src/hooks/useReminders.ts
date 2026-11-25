// 提醒任务：列表 / 详情 / 事件流 / 创建 / 立即查询 / 停止。
// 写操作后统一 invalidate 对应前缀（docs/api.md §7）。

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildQuery } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import type { ReminderListParams } from '@/lib/queryKeys';
import type {
  CheckReminderResponse,
  CreateReminderResponse,
  Paginated,
  Reminder,
  ReminderDetail,
  ReminderEvent,
} from '@/lib/types';

export interface CreateReminderBody {
  pickupCode: string;
  cabCode: string;
  durationMin: number;
}

export function useReminders(params: ReminderListParams) {
  return useQuery({
    queryKey: qk.reminders(params),
    queryFn: () =>
      api.get<Paginated<Reminder>>(
        `/reminders${buildQuery({
          status: params.status || undefined,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
    // 列表每 15 秒自动刷新，避免必须手动刷新才能看到状态变化
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

export function useReminder(id: string) {
  return useQuery({
    queryKey: qk.reminder(id),
    queryFn: () => api.get<ReminderDetail>(`/reminders/${id}`),
    enabled: Boolean(id),
    // 任务进行中时轮询，让状态与剩余时间自动更新
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'PENDING' || status === 'BASELINE' || status === 'WAITING') return 15_000;
      return false;
    },
  });
}

export function useReminderEvents(id: string, page: number, pageSize = 20) {
  return useQuery({
    queryKey: qk.reminderEvents(id, page),
    queryFn: () =>
      api.get<Paginated<ReminderEvent>>(`/reminders/${id}/events${buildQuery({ page, pageSize })}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReminderBody) =>
      api.post<CreateReminderResponse>('/reminders', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

export function useCheckReminder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CheckReminderResponse>(`/reminders/${id}/check`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.reminder(id) });
      void queryClient.invalidateQueries({ queryKey: ['reminder-events', id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

export function useStopReminder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Reminder>(`/reminders/${id}/stop`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.reminder(id) });
      void queryClient.invalidateQueries({ queryKey: ['reminder-events', id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

export interface OpenBoxResponse {
  ok: boolean;
  message: string;
  openCount: number;
  cabinet: string;
}

/** 一键开箱：会物理开门，服务端限 3 次/任务、10 秒间隔。 */
export function useOpenBox(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OpenBoxResponse>(`/reminders/${id}/open`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.reminder(id) });
      void queryClient.invalidateQueries({ queryKey: ['reminder-events', id] });
    },
  });
}
