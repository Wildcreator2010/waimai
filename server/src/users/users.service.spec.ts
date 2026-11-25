import { Role, UserStatus, type User } from '@prisma/client';

import type { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../common/decorators';
import type { AuditService } from '../audit/audit.service';
import type { RateLimiter } from '../common/rate-limit';
import type { SmsService } from '../notifications/sms.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SystemSettingService } from '../settings/settings.service';
import { UsersService } from './users.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    passwordSalt: 'salt',
    passwordIterations: 210000,
    role: Role.USER,
    status: UserStatus.ACTIVE,
    displayName: '',
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    phone: '13800138000',
    phoneVerifiedAt: new Date('2026-01-02T00:00:00Z'),
    showNotifyDetails: true,
    smsEnabled: true,
    ntfyEnabled: false,
    ntfyTopic: 'topic-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    lastLoginAt: null,
    sessionVersion: 0,
    termsAcceptedAt: null,
    termsVersion: '',
    ...overrides,
  };
}

function makeActor(role: Role): AuthUser {
  return {
    id: role === Role.ROOT ? 'root-1' : 'admin-1',
    email: role === Role.ROOT ? 'root@example.com' : 'admin@example.com',
    role,
    status: UserStatus.ACTIVE,
    displayName: '',
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    phone: null,
    phoneVerifiedAt: null,
  };
}

function makeService(target: User) {
  const tx = {
    user: {
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeUser({ ...target, ...(data as Partial<User>) })),
      ),
    },
    refreshSession: { updateMany: jest.fn(() => Promise.resolve({ count: 1 })) },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(() => Promise.resolve(target)),
      update: jest.fn(),
    },
    refreshSession: { updateMany: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const audit = { record: jest.fn(() => Promise.resolve(undefined)) };
  const settings = { getString: jest.fn(() => Promise.resolve('http://127.0.0.1:8080')) };
  const sms = { canSendVerify: jest.fn(() => true) };
  const limiter = { consume: jest.fn(() => true) };
  // 客户端看到的 ntfy 地址来自 NTFY_PUBLIC_URL；测试里留空以走 SystemSetting 回落
  const config = { get: jest.fn(() => '') };

  const service = new UsersService(
    prisma as unknown as PrismaService,
    settings as unknown as SystemSettingService,
    sms as unknown as SmsService,
    audit as unknown as AuditService,
    limiter as unknown as RateLimiter,
    config as unknown as ConfigService,
  );
  return { service, prisma, tx, audit };
}

describe('管理员改用户：权限分支', () => {
  it('ADMIN 不能改角色（403 FORBIDDEN），且不落库不写审计', async () => {
    const { service, tx, audit } = makeService(makeUser({ role: Role.USER }));

    await expect(
      service.updateUser(makeActor(Role.ADMIN), 'user-1', { role: Role.ADMIN }, '10.0.0.1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('ROOT 可以把 USER 提升为 ADMIN，并写 USER_UPDATE 审计', async () => {
    const { service, tx, audit } = makeService(makeUser({ role: Role.USER }));

    const view = await service.updateUser(
      makeActor(Role.ROOT),
      'user-1',
      { role: Role.ADMIN },
      '10.0.0.1',
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: Role.ADMIN },
    });
    expect(view.role).toBe(Role.ADMIN);
    // 对外对象不含密码字段
    expect(view).not.toHaveProperty('passwordHash');
    expect(view).not.toHaveProperty('passwordSalt');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_UPDATE', targetId: 'user-1', actorId: 'root-1' }),
    );
  });

  it('任何人都不能改 ROOT 的角色或状态（403），ADMIN 也不能停用其他 ADMIN', async () => {
    const rootTarget = makeService(makeUser({ id: 'root-2', role: Role.ROOT }));
    await expect(
      rootTarget.service.updateUser(makeActor(Role.ROOT), 'root-2', { status: UserStatus.DISABLED }, ''),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      rootTarget.service.updateUser(makeActor(Role.ROOT), 'root-2', { role: Role.ADMIN }, ''),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(rootTarget.tx.user.update).not.toHaveBeenCalled();

    const adminTarget = makeService(makeUser({ id: 'admin-2', role: Role.ADMIN }));
    await expect(
      adminTarget.service.updateUser(
        makeActor(Role.ADMIN),
        'admin-2',
        { status: UserStatus.DISABLED },
        '',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(adminTarget.tx.user.update).not.toHaveBeenCalled();
  });

  it('停用普通用户时 sessionVersion+1 并撤销其全部 refresh session', async () => {
    const { service, tx, audit } = makeService(makeUser({ role: Role.USER }));

    await service.updateUser(makeActor(Role.ADMIN), 'user-1', { status: UserStatus.DISABLED }, '');

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { status: UserStatus.DISABLED, sessionVersion: { increment: 1 } },
    });
    expect(tx.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_UPDATE' }),
    );
  });
});
