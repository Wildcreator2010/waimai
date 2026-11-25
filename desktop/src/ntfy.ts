import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';

/** ntfy 流式 /json 接口的单行消息对象（仅声明我们关心的字段） */
export interface NtfyMessage {
  id?: string;
  time?: number;
  event?: string;
  topic?: string;
  title?: string;
  message?: string;
  tags?: string[];
}

export interface NtfyStatus {
  connected: boolean;
  serverUrl: string | null;
  topic: string | null;
}

const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_LINE_BUFFER = 1024 * 1024;

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; code?: unknown };
  return e.name === 'AbortError' || e.code === 'ABORT_ERR';
}

/**
 * 主进程内的 ntfy 订阅器：
 * - GET `${serverUrl}/${topic}/json` 长连接，按行解析 JSON
 * - event === "message" 时回调上报
 * - 断线指数退避重连（1s 起，封顶 60s），AbortController 取消
 * - 任何网络错误都不会抛出到调用方，只记录日志并重连
 */
export class NtfySubscriber {
  private target: { serverUrl: string; topic: string } | null = null;
  private request: http.ClientRequest | null = null;
  private response: http.IncomingMessage | null = null;
  private controller: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private connected = false;
  private stopping = true;

  constructor(
    private readonly onMessage: (msg: NtfyMessage) => void,
    private readonly onStatusChange?: (status: NtfyStatus) => void,
  ) {}

  /** 开始订阅（会先停止旧订阅）；参数非法时等于停止 */
  start(serverUrl: string, topic: string): void {
    const server = String(serverUrl ?? '').trim().replace(/\/+$/, '');
    const t = String(topic ?? '').trim().replace(/^\/+|\/+$/g, '');
    this.stop();
    if (!server || !t) return;
    this.stopping = false;
    this.target = { serverUrl: server, topic: t };
    this.attempt = 0;
    this.scheduleConnect(0);
    this.emitStatus();
  }

  /** 重配置：停止旧订阅并按新参数重连 */
  reconfigure(serverUrl: string, topic: string): void {
    this.start(serverUrl, topic);
  }

  /** 彻底停止，不再重连 */
  stop(): void {
    this.stopping = true;
    this.target = null;
    this.setConnected(false);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
  }

  status(): NtfyStatus {
    return {
      connected: this.connected,
      serverUrl: this.target ? this.target.serverUrl : null,
      topic: this.target ? this.target.topic : null,
    };
  }

  private emitStatus(): void {
    try {
      this.onStatusChange?.(this.status());
    } catch {
      // 状态回调不允许影响订阅器
    }
  }

  private setConnected(value: boolean): void {
    if (this.connected !== value) {
      this.connected = value;
      this.emitStatus();
    }
  }

  private scheduleConnect(delayMs: number): void {
    if (this.stopping || !this.target) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, Math.max(0, delayMs));
    this.reconnectTimer.unref?.();
  }

  private connect(): void {
    const target = this.target;
    if (!target || this.stopping) return;
    let url: URL;
    try {
      // 服务端 /me/ntfy/config 返回的 serverUrl 可能是 wss://（见 docs/api.md），
      // 本模块走 http/https 流式拉取，这里把 WebSocket 协议映射为对应的 HTTP 协议。
      const rawUrl = `${target.serverUrl}/${encodeURIComponent(target.topic)}/json`
        .replace(/^wss:\/\//i, 'https://')
        .replace(/^ws:\/\//i, 'http://');
      url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('仅支持 http/https');
    } catch (err) {
      this.fail('ntfy 地址无效', err);
      return;
    }
    const mod = url.protocol === 'https:' ? https : http;
    const controller = new AbortController();
    this.controller = controller;
    let request: http.ClientRequest;
    try {
      request = mod.request(
        url,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
        (res) => this.handleResponse(res),
      );
    } catch (err) {
      this.cleanup();
      this.fail('创建请求失败', err);
      return;
    }
    request.on('error', (err: unknown) => {
      if (this.stopping || isAbortError(err)) return;
      this.fail('连接错误', err);
    });
    request.end();
    this.request = request;
  }

  private handleResponse(res: http.IncomingMessage): void {
    if (this.stopping) {
      res.destroy();
      return;
    }
    const status = res.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      res.resume();
      this.fail(`HTTP ${status}`, new Error(`ntfy 返回 HTTP ${status}`));
      return;
    }
    // 连接建立成功：重置退避
    this.attempt = 0;
    this.setConnected(true);

    let buffer = '';
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '').trim();
        buffer = buffer.slice(idx + 1);
        this.handleLine(line);
      }
      // 防御异常超长行
      if (buffer.length > MAX_LINE_BUFFER) buffer = '';
    });
    res.on('error', (err: unknown) => {
      if (this.stopping || isAbortError(err)) return;
      this.fail('流读取错误', err);
    });
    res.on('end', () => {
      if (!this.stopping) this.fail('流结束', new Error('ntfy 流被服务端关闭'));
    });
    res.on('close', () => {
      this.setConnected(false);
    });
    res.on('aborted', () => {
      this.setConnected(false);
    });
    this.response = res;
  }

  private handleLine(line: string): void {
    if (!line) return;
    let msg: NtfyMessage;
    try {
      msg = JSON.parse(line) as NtfyMessage;
    } catch {
      return; // 非 JSON 行直接忽略
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.event !== 'message') return;
    try {
      this.onMessage(msg);
    } catch (err) {
      console.warn('[ntfy] 消息回调异常:', err);
    }
  }

  private fail(reason: string, err: unknown): void {
    this.cleanup();
    if (this.stopping) return;
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[ntfy] ${reason}: ${detail}，${this.nextBackoffMs()}ms 后重连`);
    this.setConnected(false);
    this.scheduleConnect(this.nextBackoffMs());
    this.attempt += 1;
  }

  private nextBackoffMs(): number {
    return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, this.attempt));
  }

  private cleanup(): void {
    if (this.controller) {
      try {
        this.controller.abort();
      } catch {
        // ignore
      }
      this.controller = null;
    }
    if (this.response) {
      try {
        this.response.destroy();
      } catch {
        // ignore
      }
      this.response = null;
    }
    if (this.request) {
      try {
        this.request.destroy();
      } catch {
        // ignore
      }
      this.request = null;
    }
  }
}
