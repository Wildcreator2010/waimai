import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NtfyPublishInput {
  serverUrl: string;
  topic: string;
  title: string;
  message: string;
  priority?: 'min' | 'low' | 'default' | 'high' | 'urgent';
  tags?: string[];
}

export interface NtfyResult {
  ok: boolean;
  reason?: string;
}

/**
 * ntfy 发布（服务端 → ntfy 实例）。客户端另有一条主动 WebSocket 订阅路径，
 * 两条路径互不依赖：服务端 publish 失败不影响已连接客户端的实时性，
 * 反之客户端断线时也能靠 ntfy 的 since 缓存补收。
 */
@Injectable()
export class NtfyService {
  private readonly logger = new Logger('ntfy');
  private readonly defaultServer: string;
  private readonly defaultToken: string;

  constructor(config: ConfigService) {
    this.defaultServer = config.get<string>('NTFY_SERVER_URL', 'http://127.0.0.1:8080').replace(/\/$/, '');
    this.defaultToken = config.get<string>('NTFY_ACCESS_TOKEN', '');
  }

  async publish(input: NtfyPublishInput): Promise<NtfyResult> {
    const server = (input.serverUrl || this.defaultServer).replace(/\/$/, '');
    const url = `${server}/${encodeURIComponent(input.topic)}`;
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
      Title: encodeHeader(input.title),
      Priority: input.priority ?? 'high',
      Tags: (input.tags ?? ['takeout']).join(','),
    };
    if (this.defaultToken) headers.Authorization = `Bearer ${this.defaultToken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: input.message,
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ok: false, reason: `HTTP ${response.status}` };
      }
      return { ok: true };
    } catch (error) {
      this.logger.warn(`ntfy 发布失败：${(error as Error).message}`);
      return { ok: false, reason: (error as Error).name };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** ntfy 的 Title 头只允许 ASCII 可见字符，中文标题做 RFC 2047 编码。 */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}
