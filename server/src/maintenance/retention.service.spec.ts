import { RetentionService, msUntilNextRun } from './retention.service';

type DeleteArgs = { where: { createdAt: { lt: Date }; OR?: unknown[] } };

function makeService(reminderDays = 30, auditDays = 90) {
  const captured: Array<{ name: string; args: unknown }> = [];
  const deleteMany = (name: string) => (args: unknown) => {
    captured.push({ name, args });
    return Promise.resolve({ count: 1 });
  };
  const prisma = {
    reminder: { deleteMany: deleteMany('reminder') },
    smsLog: { deleteMany: deleteMany('smsLog') },
    auditLog: { deleteMany: deleteMany('auditLog') },
    verificationToken: { deleteMany: deleteMany('verificationToken') },
    refreshSession: { deleteMany: deleteMany('refreshSession') },
    $transaction: (ops: Array<Promise<{ count: number }>>) => Promise.all(ops),
  };
  const config = {
    get: (key: string, fallback: unknown) => {
      if (key === 'RETENTION_REMINDER_DAYS') return reminderDays;
      if (key === 'RETENTION_AUDIT_DAYS') return auditDays;
      if (key === 'NODE_ENV') return 'test';
      return fallback;
    },
  };
  const now = new Date('2026-11-10T12:00:00+08:00');
  const service = new RetentionService(prisma as never, config as never);
  return { service, captured, now };
}

function argsOf(captured: Array<{ name: string; args: unknown }>, name: string): DeleteArgs {
  const found = captured.find((item) => item.name === name);
  if (!found) throw new Error(`没有捕获到 ${name} 的删除调用`);
  return found.args as DeleteArgs;
}

describe('数据保留清理', () => {
  it('按 30/90 天分别计算截止时间', async () => {
    const { service, captured, now } = makeService();
    await service.runOnce(now);

    const reminderCutoff = argsOf(captured, 'reminder').where.createdAt.lt;
    const smsCutoff = argsOf(captured, 'smsLog').where.createdAt.lt;
    const auditCutoff = argsOf(captured, 'auditLog').where.createdAt.lt;

    expect(now.getTime() - reminderCutoff.getTime()).toBe(30 * 86_400_000);
    expect(now.getTime() - smsCutoff.getTime()).toBe(90 * 86_400_000);
    expect(auditCutoff.getTime()).toBe(smsCutoff.getTime());
  });

  it('返回各表删除行数', async () => {
    const { service, now } = makeService();
    await expect(service.runOnce(now)).resolves.toEqual({
      reminders: 1,
      smsLogs: 1,
      auditLogs: 1,
      tokens: 1,
      sessions: 1,
    });
  });

  it('一次性令牌与会话只删过期或已消费且超过 7 天的', async () => {
    const { service, captured, now } = makeService();
    await service.runOnce(now);

    const tokens = argsOf(captured, 'verificationToken');
    expect(tokens.where.OR).toHaveLength(2);
    expect(now.getTime() - tokens.where.createdAt.lt.getTime()).toBe(7 * 86_400_000);

    const sessions = argsOf(captured, 'refreshSession');
    expect(sessions.where.OR).toHaveLength(2);
  });

  it('自定义保留天数生效', async () => {
    const { service, captured, now } = makeService(7, 14);
    await service.runOnce(now);
    const reminderCutoff = argsOf(captured, 'reminder').where.createdAt.lt;
    expect(now.getTime() - reminderCutoff.getTime()).toBe(7 * 86_400_000);
  });
});

describe('msUntilNextRun', () => {
  it('当天尚未到点则返回今天的时间差', () => {
    const now = new Date('2026-11-10T01:00:00+08:00');
    expect(msUntilNextRun(now, 3)).toBe(2 * 3600_000);
  });

  it('已过点则顺延到明天', () => {
    const now = new Date('2026-11-10T04:00:00+08:00');
    expect(msUntilNextRun(now, 3)).toBe(23 * 3600_000);
  });

  it('正好到点则顺延到明天（避免同一时刻重复执行）', () => {
    const now = new Date('2026-11-10T03:00:00+08:00');
    expect(msUntilNextRun(now, 3)).toBe(24 * 3600_000);
  });
});
