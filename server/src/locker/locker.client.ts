import { Logger } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LockerErrorKind = 'not_configured' | 'expired' | 'network' | 'api';

export class LockerError extends Error {
  constructor(
    public readonly kind: LockerErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LockerError';
  }
}

export interface LockerState {
  arrived: boolean;
  cabinet: string;
  detail: string;
  fingerprint: string;
  /** 命中记录里的订单号，一键开箱要用 */
  orderId: string;
  /** 本次查询使用的柜机 locker_id，一键开箱要用 */
  lockerId: string;
}

/** 柜号候选字段（沿用旧版逆向结果，按优先级尝试）。 */
const CABINET_KEYS = [
  'box_sn',
  'boxSn',
  'cabinetNo',
  'boxNo',
  'cellNo',
  'lockerNo',
  'gridNo',
  'boxNum',
  'doorNo',
  'cellId',
  'cabinet',
  'box',
  'cell',
  'position',
  'location',
];

/** 指纹身份候选字段：用于区分「上一单」与「这一单」。 */
const IDENTITY_KEYS = [
  'id',
  'orderid',
  'order_id',
  'orderNo',
  'orderId',
  'takeCode',
  'pickupCode',
  'recordId',
  'tradeNo',
];

/** 开箱接口要的 orderid，优先真实订单号，最后才回落到记录 id。 */
const ORDER_ID_KEYS = ['orderid', 'orderId', 'order_id', 'orderNo', 'tradeNo', 'recordId', 'id'];

interface LockerPayload {
  code?: unknown;
  msg?: unknown;
  data?: unknown;
}

/**
 * 取餐柜开放接口客户端（只学这一层，其余全部重写）。
 *
 *   openMark(cabCode)          -> locker_id
 *   takeCode(locker_id, code)  -> data[] 非空且含 box_sn 即已入柜
 *   code 400  = 尚未入柜
 *   code 401  = MemberToken 失效
 */
@Injectable()
export class LockerClient {
  private readonly logger = new Logger('Locker');
  private readonly base: string;
  private readonly openMarkPath: string;
  private readonly takePath: string;
  private readonly openBoxPath: string;
  private readonly timeoutMs: number;
  private readonly lockerIds = new Map<string, string>();
  /** 演示/联调模式：不调真实接口，按次数模拟「入柜」。 */
  private readonly mock: boolean;
  private readonly mockArrivalAfter: number;
  private readonly mockChecks = new Map<string, number>();

  constructor(private readonly config: ConfigService) {
    this.base = config.get<string>('LOCKER_API_BASE', 'https://csmini.guangeiot.com').replace(/\/$/, '');
    this.openMarkPath = config.get<string>('LOCKER_OPENMARK_PATH', '/wechat/locker/openMark');
    this.takePath = config.get<string>('LOCKER_TAKE_PATH', '/wechat/locker/takeCode');
    this.openBoxPath = config.get<string>('LOCKER_OPENBOX_PATH', '/wechat/locker/takeOpen');
    this.timeoutMs = config.get<number>('LOCKER_TIMEOUT_MS', 10000);
    // ConfigModule 已把布尔变量解析成 boolean，这里同时兼容字符串写法
    const mockRaw = config.get<boolean | string>('LOCKER_MOCK', false);
    this.mock = mockRaw === true || mockRaw === 'true';
    this.mockArrivalAfter = Math.max(1, Number(config.get<string | number>('MOCK_ARRIVAL_AFTER', 2)) || 2);
    if (this.mock) {
      this.logger.warn('取餐柜客户端处于 MOCK 模式：不会调用真实接口，第 2 次查询起模拟入柜');
    }
  }

  isMock(): boolean {
    return this.mock;
  }

  /** 清空 locker_id 缓存（凭证变更或返回 401 时调用）。 */
  resetCache(): void {
    this.lockerIds.clear();
  }

  async query(token: string, pickupCode: string, cabCode: string): Promise<LockerState> {
    if (this.mock) return this.mockQuery(pickupCode, cabCode);
    if (!token) throw new LockerError('not_configured', '未配置 MemberToken');

    const lockerId = await this.ensureLockerId(token, cabCode);
    const payload = await this.post(token, this.takePath, { locker_id: lockerId, code: pickupCode });
    const code = String(payload.code ?? '');

    if (code === '401') {
      this.resetCache();
      throw new LockerError('expired', 'MemberToken 已失效');
    }
    if (code === '400') {
      return {
        arrived: false,
        cabinet: '',
        detail: `尚未入柜：${truncate(String(payload.msg ?? '未找到该取件码的订单'), 120)}`,
        fingerprint: '',
        orderId: '',
        lockerId,
      };
    }
    if (code !== '200' && code !== '302') {
      throw new LockerError('api', `takeCode 失败 code=${code} msg=${truncate(String(payload.msg ?? ''), 80)}`);
    }

    const records = collectRecords(payload.data);
    if (records.length === 0) {
      return {
        arrived: false,
        cabinet: '',
        detail: '接口返回空 data，暂无入柜记录',
        fingerprint: '',
        orderId: '',
        lockerId,
      };
    }

    const cabinet = pick(records, CABINET_KEYS);
    const identity = pick(records, IDENTITY_KEYS);
    const orderId = pick(records, ORDER_ID_KEYS);
    const fingerprint =
      [cabinet, identity].filter(Boolean).join('|') || JSON.stringify(records[0]).slice(0, 200);

    return {
      arrived: true,
      cabinet: cabinet || '柜号未返回',
      detail: truncate(JSON.stringify(records[0]), 300),
      fingerprint,
      orderId,
      lockerId,
    };
  }

  /**
   * 一键开箱：POST /wechat/locker/takeOpen
   * 抓包体：{"locker_id":2680,"orderid":65796908,"channel":2}
   * 返回：{code:200, msg:"开箱命令已发送", data:false}
   */
  async openBox(
    token: string,
    lockerId: string,
    orderId: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (this.mock) {
      return { ok: true, message: 'MOCK 模式：已模拟发送开箱命令' };
    }
    if (!token) return { ok: false, message: '未配置 MemberToken' };

    const body: Record<string, unknown> = {
      locker_id: toNumberOrString(lockerId),
      orderid: toNumberOrString(orderId),
      channel: 2,
    };

    try {
      const payload = await this.post(token, this.openBoxPath, body);
      const code = String(payload.code ?? '');
      if (code === '401') {
        this.resetCache();
        throw new LockerError('expired', 'MemberToken 已失效');
      }
      if (code !== '200') {
        return {
          ok: false,
          message: `code=${code} msg=${truncate(String(payload.msg ?? ''), 80)}`,
        };
      }
      return { ok: true, message: truncate(String(payload.msg ?? '开箱命令已发送'), 80) };
    } catch (error) {
      if (error instanceof LockerError) return { ok: false, message: error.message };
      return { ok: false, message: (error as Error).message };
    }
  }

  /** 仅验证凭证是否被接受（管理台「测试有效性」用）。 */
  async verify(token: string, cabCode: string): Promise<{ ok: boolean; message: string }> {
    if (this.mock) return { ok: true, message: 'MOCK 模式，视为有效' };
    try {
      const payload = await this.post(token, this.openMarkPath, { cabCode });
      const code = String(payload.code ?? '');
      if (code === '401') return { ok: false, message: '登录已失效，token 需要更换' };
      if (code === '200' || code === '302') return { ok: true, message: 'token 有效' };
      return { ok: false, message: `code=${code} msg=${truncate(String(payload.msg ?? ''), 60)}` };
    } catch (error) {
      if (error instanceof LockerError) return { ok: false, message: error.message };
      return { ok: false, message: (error as Error).message };
    }
  }

  /** MOCK 模式：前 N-1 次未入柜，第 N 次起返回固定柜号，指纹稳定便于验证「只提醒一次」。 */
  private mockQuery(pickupCode: string, cabCode: string): LockerState {
    const key = `${cabCode}|${pickupCode}`;
    const count = (this.mockChecks.get(key) ?? 0) + 1;
    this.mockChecks.set(key, count);
    if (count < this.mockArrivalAfter) {
      return {
        arrived: false,
        cabinet: '',
        detail: `模拟数据：第 ${count} 次查询，尚未入柜`,
        fingerprint: '',
        orderId: '',
        lockerId: '2680',
      };
    }
    return {
      arrived: true,
      cabinet: 'A-07',
      detail: `模拟数据：第 ${count} 次查询命中入柜记录，柜号 A-07`,
      fingerprint: `mock|${cabCode}|${pickupCode}|A-07`,
      orderId: '65796908',
      lockerId: '2680',
    };
  }

  private async ensureLockerId(token: string, cabCode: string): Promise<string> {    const cached = this.lockerIds.get(cabCode);
    if (cached) return cached;

    const payload = await this.post(token, this.openMarkPath, { cabCode });
    const code = String(payload.code ?? '');
    if (code === '401') {
      this.resetCache();
      throw new LockerError('expired', 'MemberToken 已失效');
    }
    if (code !== '200' && code !== '302') {
      throw new LockerError('api', `openMark 失败 code=${code} msg=${truncate(String(payload.msg ?? ''), 80)}`);
    }
    const lockerId = pick(collectRecords(payload.data), ['locker_id', 'lockerId', 'device_id', 'id']);
    if (!lockerId) throw new LockerError('api', 'openMark 未返回 locker_id');
    this.lockerIds.set(cabCode, lockerId);
    return lockerId;
  }

  private async post(token: string, path: string, body: Record<string, unknown>): Promise<LockerPayload> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          MemberToken: token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new LockerError('network', `接口返回 HTTP ${response.status}`);
      }
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new LockerError('api', '响应体不是 JSON');
      }
      if (!payload || typeof payload !== 'object') {
        throw new LockerError('api', '响应体格式异常');
      }
      return payload as LockerPayload;
    } catch (error) {
      if (error instanceof LockerError) throw error;
      const name = (error as Error).name;
      if (name === 'AbortError') throw new LockerError('network', '接口超时');
      this.logger.warn(`请求失败 ${path}：${(error as Error).message}`);
      throw new LockerError('network', `网络异常 ${name}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function collectRecords(node: unknown, depth = 0): Record<string, unknown>[] {  if (depth > 4) return [];
  const found: Record<string, unknown>[] = [];
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 20)) {
      if (item && typeof item === 'object') {
        found.push(item as Record<string, unknown>);
        found.push(...collectRecords(item, depth + 1));
      }
    }
  } else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    found.push(record);
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') found.push(...collectRecords(value, depth + 1));
    }
  }
  return found;
}

function pick(records: Record<string, unknown>[], keys: string[]): string {
  for (const key of keys) {
    for (const record of records) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== '' && typeof value !== 'object') {
        return String(value);
      }
    }
  }
  return '';
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** 抓包体里 locker_id / orderid 都是数字；能转数字就转，否则原样发。 */
function toNumberOrString(value: string): number | string {
  const trimmed = String(value ?? '').trim();
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isSafeInteger(num)) return num;
  }
  return trimmed;
}
