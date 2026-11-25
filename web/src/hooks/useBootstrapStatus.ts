// 引导状态（首次部署）：无鉴权接口。

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import type { BootstrapStatus } from '@/lib/types';

export function useBootstrapStatus() {
  return useQuery({
    queryKey: qk.bootstrapStatus,
    queryFn: () => api.get<BootstrapStatus>('/bootstrap/status'),
    staleTime: 30_000,
  });
}
