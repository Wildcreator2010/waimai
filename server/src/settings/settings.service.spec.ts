import type { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import { SETTING_DEFS, encodeSettingValue } from './setting-keys';
import { SystemSettingService } from './settings.service';

interface FakePrisma {
  prisma: PrismaService;
  rows: Map<string, string>;
}

/** 用内存 Map 模拟 SystemSetting 表；不连真库。 */
function makePrisma(initial: Array<[string, string]> = []): FakePrisma {
  const rows = new Map(initial);
  const systemSetting = {
    findUnique: jest.fn(({ where }: { where: { key: string } }) =>
      Promise.resolve(rows.has(where.key) ? { value: rows.get(where.key) as string } : null),
    ),
    findMany: jest.fn(() =>
      Promise.resolve([...rows.entries()].map(([key, value]) => ({ key, value }))),
    ),
    upsert: jest.fn(
      ({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: { key: string; value: string };
        update: { value: string };
      }) => {
        rows.set(where.key, create.value ?? update.value);
        return Promise.resolve({ key: where.key, value: rows.get(where.key) as string });
      },
    ),
  };
  const client = {
    systemSetting,
    $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  return { prisma: client as unknown as PrismaService, rows };
}

describe('SystemSettingService', () => {
  it('空表时 getAll 返回默认值，且类型与默认表一致', async () => {
    const { prisma } = makePrisma();
    const service = new SystemSettingService(prisma);

    const all = await service.getAll();

    expect(Object.keys(all)).toEqual(Object.keys(SETTING_DEFS));
    expect(all).toEqual({
      pollIntervalSec: 60,
      defaultDurationMin: 60,
      maxDurationMin: 720,
      maxActiveRemindersPerUser: 5,
      lockerDeviceSn: '2680',
      defaultLockerCabCode: 'SYA61026AP',
      lockerApiBase: 'https://csmini.guangeiot.com',
      ntfyServerUrl: 'http://127.0.0.1:8080',
      registrationOpen: true,
      showNotifyDetailsDefault: true,
      openBoxWindowHours: 24,
    });
    expect(typeof all.pollIntervalSec).toBe('number');
    expect(typeof all.lockerDeviceSn).toBe('string');
    expect(typeof all.registrationOpen).toBe('boolean');
  });

  it('按存储文本做类型转换：数字/布尔/字符串，脏值退回默认值', async () => {
    const { prisma } = makePrisma([
      ['pollIntervalSec', '45'],
      ['registrationOpen', 'false'],
      ['lockerDeviceSn', '9999'],
      // 下面两项是脏值：不能被当成合法设置，也不能抛错
      ['defaultDurationMin', 'not-a-number'],
      ['showNotifyDetailsDefault', 'maybe'],
      // 兼容手工写入的 JSON 引号形式
      ['ntfyServerUrl', '"https://ntfy.example.com"'],
    ]);
    const service = new SystemSettingService(prisma);

    await expect(service.getInt('pollIntervalSec', 60)).resolves.toBe(45);
    await expect(service.getBool('registrationOpen', true)).resolves.toBe(false);
    await expect(service.getString('lockerDeviceSn', '2680')).resolves.toBe('9999');
    await expect(service.getInt('defaultDurationMin', 60)).resolves.toBe(60);
    await expect(service.getBool('showNotifyDetailsDefault', true)).resolves.toBe(true);
    await expect(service.getString('ntfyServerUrl', 'http://127.0.0.1:8080')).resolves.toBe(
      'https://ntfy.example.com',
    );
    // 不存在的键走 fallback
    await expect(service.getInt('missingKey', 7)).resolves.toBe(7);
    await expect(service.getString('missingKey', 'x')).resolves.toBe('x');
    await expect(service.getBool('missingKey', false)).resolves.toBe(false);

    const all = await service.getAll();
    expect(all.pollIntervalSec).toBe(45);
    expect(all.registrationOpen).toBe(false);
  });

  it('update 以标量文本 upsert，只报告真正变化的键，并拒绝越界值', async () => {
    const { prisma, rows } = makePrisma();
    const service = new SystemSettingService(prisma);

    const result = await service.update({ pollIntervalSec: 45, registrationOpen: false });

    expect(result.changed).toEqual(['pollIntervalSec', 'registrationOpen']);
    expect(result.settings.pollIntervalSec).toBe(45);
    expect(result.settings.registrationOpen).toBe(false);
    // 存的是标量文本，与 src/common/setting-reader.ts 的读法保持一致
    expect(rows.get('pollIntervalSec')).toBe(encodeSettingValue(45));
    expect(rows.get('registrationOpen')).toBe('false');

    // 传了值但没变化：不算 changed，也不写库
    const noop = await service.update({ pollIntervalSec: 45 });
    expect(noop.changed).toEqual([]);

    await expect(service.update({ pollIntervalSec: 5 })).rejects.toBeInstanceOf(AppError);
    await expect(service.update({ defaultDurationMin: 900 })).rejects.toBeInstanceOf(AppError);
    await expect(service.update({ ntfyServerUrl: 'not a url' })).rejects.toBeInstanceOf(AppError);
    // 跨键约束：默认时长不能超过上限
    await expect(service.update({ defaultDurationMin: 600, maxDurationMin: 300 })).rejects.toThrow(
      'defaultDurationMin 不能大于 maxDurationMin',
    );
  });
});
