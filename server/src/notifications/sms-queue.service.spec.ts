import { SmsQueueService, type ArrivalSmsJob } from './sms-queue.service';

const job = (id: string, phone = '13800138000'): ArrivalSmsJob => ({
  userId: 'u1',
  phone,
  cabCode: 'SYA61026AP',
  boxSn: 'A-07',
  sn: '2680',
  kind: 'arrival',
  reminderId: id,
});

interface Row {
  id: string;
  status: string;
  attempts: number;
  phone: string;
  [key: string]: unknown;
}

function makePrisma() {
  const rows: Row[] = [];
  let seq = 0;
  const apply = (row: Row, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in (value as object)) {
        row[key] = Number(row[key] ?? 0) + Number((value as { increment: number }).increment);
      } else {
        row[key] = value;
      }
    }
  };
  const prisma = {
    rows,
    smsJob: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        seq += 1;
        const row = { id: `j${seq}`, attempts: 0, ...data } as Row;
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { status: string } }) =>
        rows.find((row) => row.status === where.status) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; status: string };
        data: Record<string, unknown>;
      }) => {
        const targets = rows.filter(
          (row) => row.status === where.status && (where.id === undefined || row.id === where.id),
        );
        targets.forEach((row) => apply(row, data));
        return { count: targets.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error('row not found');
        apply(row, data);
        return row;
      },
    },
  };
  return prisma;
}

const makeAudit = () => ({ alert: jest.fn(async () => undefined) });

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('等待超时');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function settled(rows: Row[]): boolean {
  return rows.every((row) => row.status === 'SENT' || row.status === 'FAILED');
}

describe('短信队列（落库）', () => {
  it('入队写库，发送成功后状态变 SENT', async () => {
    const prisma = makePrisma();
    const sms = { sendArrival: jest.fn(async () => ({ ok: true })) };
    const queue = new SmsQueueService(prisma as never, sms as never, makeAudit() as never);

    await queue.enqueue(job('r1'));
    await waitFor(() => settled(prisma.rows));

    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0].status).toBe('SENT');
    expect(prisma.rows[0].attempts).toBe(1);
    await queue.onModuleDestroy();
  });

  it('发送失败记 FAILED 与原因', async () => {
    const prisma = makePrisma();
    const sms = { sendArrival: jest.fn(async () => ({ ok: false, reason: 'ECONNRESET' })) };
    const queue = new SmsQueueService(prisma as never, sms as never, makeAudit() as never);

    await queue.enqueue(job('r1'));
    await waitFor(() => settled(prisma.rows));

    expect(prisma.rows[0].status).toBe('FAILED');
    expect(prisma.rows[0].lastError).toBe('ECONNRESET');
    await queue.onModuleDestroy();
  });

  it('抛异常时任务标 FAILED 并触发管理员告警', async () => {
    const prisma = makePrisma();
    const sms = {
      sendArrival: jest.fn(async () => {
        throw new Error('boom');
      }),
    };
    const audit = makeAudit();
    const queue = new SmsQueueService(prisma as never, sms as never, audit as never);

    await queue.enqueue(job('r1'));
    await waitFor(() => settled(prisma.rows));

    expect(prisma.rows[0].status).toBe('FAILED');
    expect(audit.alert).toHaveBeenCalled();
    await queue.onModuleDestroy();
  });

  it('并发不超过 2', async () => {
    const prisma = makePrisma();
    let active = 0;
    let maxActive = 0;
    const sms = {
      sendArrival: jest.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active -= 1;
        return { ok: true };
      }),
    };
    const queue = new SmsQueueService(prisma as never, sms as never, makeAudit() as never);

    for (let i = 0; i < 6; i += 1) await queue.enqueue(job(`r${i}`, `1380013800${i}`));
    await waitFor(() => settled(prisma.rows));

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(sms.sendArrival).toHaveBeenCalledTimes(6);
    await queue.onModuleDestroy();
  });

  it('启动时把遗留 SENDING 标为 FAILED 且不重发', async () => {
    const prisma = makePrisma();
    prisma.rows.push({ id: 'stale', status: 'SENDING', attempts: 1, phone: '13800138000' });
    const sms = { sendArrival: jest.fn(async () => ({ ok: true })) };
    const queue = new SmsQueueService(prisma as never, sms as never, makeAudit() as never);

    await queue.onModuleInit();

    expect(prisma.rows[0].status).toBe('FAILED');
    expect(sms.sendArrival).not.toHaveBeenCalled();
    await queue.onModuleDestroy();
  });

  it('停止后不再入队', async () => {
    const prisma = makePrisma();
    const sms = { sendArrival: jest.fn(async () => ({ ok: true })) };
    const queue = new SmsQueueService(prisma as never, sms as never, makeAudit() as never);
    await queue.onModuleDestroy();

    await queue.enqueue(job('late'));
    expect(prisma.rows).toHaveLength(0);
    expect(sms.sendArrival).not.toHaveBeenCalled();
  });
});
