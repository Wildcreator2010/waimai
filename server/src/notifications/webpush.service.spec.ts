import webpush from 'web-push';

import { WebPushService } from './webpush.service';

// 用真实格式的 VAPID 密钥（每次随机生成），否则 setVapidDetails 会抛错
const vapid = webpush.generateVAPIDKeys();

function makeService(keys: { pub?: string; priv?: string } = {}) {
  const config = {
    get: (key: string, fallback: unknown) => {
      if (key === 'WEBPUSH_PUBLIC_KEY') return keys.pub ?? '';
      if (key === 'WEBPUSH_PRIVATE_KEY') return keys.priv ?? '';
      if (key === 'WEBPUSH_SUBJECT') return 'mailto:test@example.com';
      return fallback;
    },
  };
  const prisma = {
    webPushSubscription: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      updateMany: jest.fn(async () => ({ count: 0 })),
      upsert: jest.fn(
        async (_args: {
          where: { endpoint: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => ({ id: 'sub-1' }),
      ),
    },
  };
  return { service: new WebPushService(config as never, prisma as never), prisma };
}

describe('浏览器 Web Push', () => {
  it('未配置 VAPID 密钥时关闭，且发送直接跳过', async () => {
    const { service, prisma } = makeService();
    expect(service.isEnabled()).toBe(false);
    expect(service.getPublicKey()).toBe('');

    const result = await service.sendToUser('u1', { title: 't', body: 'b', url: '/x' });
    expect(result.attempted).toBe(false);
    expect(prisma.webPushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('配置密钥后启用，无订阅时返回未尝试', async () => {
    const { service } = makeService({ pub: vapid.publicKey, priv: vapid.privateKey });
    expect(service.isEnabled()).toBe(true);
    expect(service.getPublicKey()).toBe(vapid.publicKey);

    const result = await service.sendToUser('u1', { title: 't', body: 'b', url: '/x' });
    expect(result.attempted).toBe(false);
    expect(result.reason).toContain('没有浏览器订阅');
  });

  it('订阅时按 endpoint upsert（同浏览器换账号会改归属）', async () => {
    const { service, prisma } = makeService({ pub: vapid.publicKey, priv: vapid.privateKey });
    const out = await service.subscribe('u9', {
      endpoint: 'https://push.example.com/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      userAgent: 'UA',
    });
    expect(out.id).toBe('sub-1');

    const arg = prisma.webPushSubscription.upsert.mock.calls[0][0];
    expect(arg.where.endpoint).toBe('https://push.example.com/abc');
    expect((arg.update as { userId: string }).userId).toBe('u9');
  });

  it('订阅列表只回显域名，不泄露完整 endpoint', async () => {
    const { service, prisma } = makeService({ pub: vapid.publicKey, priv: vapid.privateKey });
    prisma.webPushSubscription.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/SECRET_TOKEN',
        userAgent: 'UA',
        createdAt: new Date(),
        lastUsedAt: null,
      },
    ] as never);

    const rows = await service.list('u1');
    expect(rows[0].endpointHost).toBe('fcm.googleapis.com');
    expect(JSON.stringify(rows)).not.toContain('SECRET_TOKEN');
  });
});
