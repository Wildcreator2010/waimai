import { Injectable, Logger } from '@nestjs/common';

import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSettingsDto } from './dto';
import {
  SETTING_DEFS,
  SETTING_KEYS,
  decodeBoolSetting,
  decodeIntSetting,
  decodeSetting,
  decodeStringSetting,
  encodeSettingValue,
  type SettingDef,
  type SettingKey,
  type SettingValue,
} from './setting-keys';

export type SettingsMap = Record<string, SettingValue>;

export interface SettingsUpdateResult {
  settings: SettingsMap;
  /** 真正发生变化的键（用于审计 detail，也用于前端提示） */
  changed: SettingKey[];
}

/**
 * 系统设置（`SystemSetting` 键值表）。
 *
 * 设计要点：
 * - **无缓存**：调度器每轮读一次 `pollIntervalSec`，一次主键查询的开销远小于"改了设置要等缓存过期"带来的困惑。
 * - **默认值兜底**：表里没有的键按 `SETTING_DEFS` 的默认值返回，因此空库也能启动。
 * - **写入用 upsert**：管理台不需要预先 seed 数据。
 * - 读取容忍脏值（非数字、JSON 引号、布尔别名），脏值退回 fallback 而不是抛错——
 *   一个坏掉的设置项不应该让整个轮询停摆。
 */
@Injectable()
export class SystemSettingService {
  private readonly logger = new Logger('Settings');

  constructor(private readonly prisma: PrismaService) {}

  /** 读原始文本；不存在返回 null。 */
  async getRaw(key: string): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    return row?.value ?? null;
  }

  async getInt(key: string, fallback: number): Promise<number> {
    return decodeIntSetting(await this.getRaw(key), fallback);
  }

  async getString(key: string, fallback: string): Promise<string> {
    return decodeStringSetting(await this.getRaw(key), fallback);
  }

  async getBool(key: string, fallback: boolean): Promise<boolean> {
    return decodeBoolSetting(await this.getRaw(key), fallback);
  }

  /** 全部设置，已按 `SETTING_DEFS` 的类型转换，键顺序固定。 */
  async getAll(): Promise<SettingsMap> {
    const rows = await this.prisma.systemSetting.findMany({ select: { key: true, value: true } });
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const result: SettingsMap = {};
    for (const key of SETTING_KEYS) {
      result[key] = decodeSetting(SETTING_DEFS[key], stored.get(key));
    }
    return result;
  }

  /** 默认值快照（不查库），供引导、测试与文档对照。 */
  getDefaults(): SettingsMap {
    const result: SettingsMap = {};
    for (const key of SETTING_KEYS) result[key] = SETTING_DEFS[key].default;
    return result;
  }

  /**
   * 部分更新。只处理 `UpdateSettingsDto` 声明的键，未传的键保持原值。
   * 会做两层校验：单键范围（与 DTO 一致，防止绕过控制器）+ 跨键约束。
   */
  async update(patch: UpdateSettingsDto): Promise<SettingsUpdateResult> {
    const current = await this.getAll();
    const merged: SettingsMap = { ...current };
    const changed: SettingKey[] = [];
    const writes: Array<{ key: SettingKey; value: string }> = [];
    const raw = patch as Record<string, unknown>;

    for (const key of SETTING_KEYS) {
      const next = raw[key];
      if (next === undefined) continue;
      const value = coerceSettingValue(key, SETTING_DEFS[key], next);
      merged[key] = value;
      if (value === current[key]) continue;
      changed.push(key);
      writes.push({ key, value: encodeSettingValue(value) });
    }

    // 跨键约束：默认监控时长不能超过上限，否则创建任务时会立刻被 400 挡住
    if (Number(merged.defaultDurationMin) > Number(merged.maxDurationMin)) {
      throw Errors.validation('defaultDurationMin 不能大于 maxDurationMin');
    }

    if (writes.length === 0) return { settings: current, changed };

    await this.prisma.$transaction(
      writes.map((write) =>
        this.prisma.systemSetting.upsert({
          where: { key: write.key },
          create: { key: write.key, value: write.value },
          update: { value: write.value },
        }),
      ),
    );

    this.logger.log(`系统设置已更新：${changed.join(', ')}`);
    return { settings: await this.getAll(), changed };
  }
}

/** 校验并归一化单个设置值；越界抛 VALIDATION_FAILED。 */
function coerceSettingValue(key: SettingKey, def: SettingDef, input: unknown): SettingValue {
  if (def.type === 'int') {
    const value = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw Errors.validation(`${key} 必须是整数`);
    }
    if (value < def.min || value > def.max) {
      throw Errors.validation(`${key} 必须在 ${def.min}..${def.max} 之间`);
    }
    return value;
  }

  if (def.type === 'bool') {
    if (typeof input !== 'boolean') throw Errors.validation(`${key} 必须是布尔值`);
    return input;
  }

  if (typeof input !== 'string') throw Errors.validation(`${key} 必须是字符串`);
  const value = input.trim();
  if (value === '') throw Errors.validation(`${key} 不能为空`);
  if (value.length > def.maxLength) {
    throw Errors.validation(`${key} 最长 ${def.maxLength} 字符`);
  }
  if (def.url && !/^https?:\/\/\S+$/i.test(value)) {
    throw Errors.validation(`${key} 必须是 http(s) 地址`);
  }
  return value;
}
