import { Role, UserStatus } from '@prisma/client';

import type { AuthUser } from '../common/decorators';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { InviteStatusFilter, inviteStatusOf, randomInviteCode } from './invite-status';
import { InvitesService } from './invites.service';

const actor: AuthUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: Role.ADMIN,
  status: UserStatus.ACTIVE,
  displayName: '管理员',
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  phone: null,
  phoneVerifiedAt: null,
};

function makeService() {
  const prisma = {
    invite: {
      findFirst: jest.fn((): Promise<{ id: string } | null> => Promise.resolve(null)),
      create: jest.fn(
        (args: {
          data: { code: string; email: string; note: string; expiresAt: Date };
          include?: unknown;
        }) =>
          Promise.resolve({
            id: 'invite-1',
            usedAt: null,
            usedById: null,
            createdAt: new Date('2026-11-10T00:00:00Z'),
            ...args.data,
            createdBy: { email: actor.email },
            usedBy: null,
          }),
      ),
      findUnique: jest.fn(),
      delete: jest.fn(() => Promise.resolve({})),
    },
  };
  const audit = { record: jest.fn(() => Promise.resolve(undefined)) };
  const service = new InvitesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, prisma, audit };
}

describe('邀请码规则', () => {
  it('邀请码为 INV- 加 6 位大写字母数字，且不含易混字符', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const code = randomInviteCode();
      // 排除 I / O / 0 / 1
      expect(code).toMatch(/^INV-[A-HJ-NP-Z2-9]{6}$/);
      codes.add(code);
    }
    expect(codes.size).toBeGreaterThan(190);
  });

  it('状态判定：用过优先于过期，未用未过期为 unused', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(
      inviteStatusOf({ usedAt: new Date('2026-11-09T00:00:00Z'), expiresAt: now }, now),
    ).toBe(InviteStatusFilter.used);
    expect(inviteStatusOf({ usedAt: null, expiresAt: new Date('2026-11-09T00:00:00Z') }, now)).toBe(
      InviteStatusFilter.expired,
    );
    expect(inviteStatusOf({ usedAt: null, expiresAt: new Date('2026-11-11T00:00:00Z') }, now)).toBe(
      InviteStatusFilter.unused,
    );
  });

  it('同邮箱已有未使用邀请码时拒绝生成（409 INVITE_EMAIL_PENDING）', async () => {
    const { service, prisma, audit } = makeService();
    prisma.invite.findFirst.mockResolvedValueOnce({ id: 'pending-1' });

    await expect(
      service.create(actor, { email: 'a@b.com' }, '127.0.0.1'),
    ).rejects.toMatchObject({ code: 'INVITE_EMAIL_PENDING', status: 409 });
    expect(prisma.invite.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('生成成功时邮箱归一化、默认 7 天有效，并写 INVITE_CREATE 审计', async () => {
    const { service, prisma, audit } = makeService();

    const view = await service.create(actor, { email: '  Foo@Bar.COM ', note: '同事' }, '10.0.0.1');

    expect(view.code).toMatch(/^INV-[A-Z0-9]{6}$/);
    expect(view.email).toBe('foo@bar.com');
    expect(view.status).toBe(InviteStatusFilter.unused);
    const created = prisma.invite.create.mock.calls[0][0].data;
    expect(created.email).toBe('foo@bar.com');
    const ttlDays = (created.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(6.9);
    expect(ttlDays).toBeLessThan(7.1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVITE_CREATE', actorId: actor.id, ip: '10.0.0.1' }),
    );
  });

  it('已使用的邀请码不可删除（409 INVITE_USED），未使用的删除后写 INVITE_DELETE', async () => {
    const { service, prisma, audit } = makeService();
    prisma.invite.findUnique.mockResolvedValueOnce({
      id: 'invite-1',
      code: 'INV-ABC234',
      email: 'a@b.com',
      usedAt: new Date('2026-11-01T00:00:00Z'),
    });

    await expect(service.remove(actor, 'invite-1', '')).rejects.toMatchObject({
      code: 'INVITE_USED',
      status: 409,
    });
    expect(prisma.invite.delete).not.toHaveBeenCalled();

    prisma.invite.findUnique.mockResolvedValueOnce({
      id: 'invite-2',
      code: 'INV-ABC235',
      email: 'c@d.com',
      usedAt: null,
    });
    await expect(service.remove(actor, 'invite-2', '')).resolves.toEqual({ deleted: true });
    expect(prisma.invite.delete).toHaveBeenCalledWith({ where: { id: 'invite-2' } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVITE_DELETE', targetId: 'invite-2' }),
    );
  });
});
