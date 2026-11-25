import type { Request } from 'express';

/**
 * 取真实客户端 IP 用于审计。
 * `main.ts` 已对反向代理（Caddy）设置 `trust proxy = 1`，因此 `req.ip` 已是转发后的地址；
 * 这里再兜一层 `X-Forwarded-For` 首段，避免某些部署形态下 `req.ip` 取到 127.0.0.1。
 * 审计字段只用于留痕，长度由 AuditService 截断。
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || req.socket.remoteAddress || '';
}
