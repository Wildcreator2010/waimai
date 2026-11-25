import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Errors } from '../common/errors';
import type { AuthUser } from '../common/decorators';
import { paged, type Paged } from '../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInviteDto, InviteQueryDto } from './dto';
import {
  InviteStatusFilter,
  inviteStatusOf,
  randomInviteCode,
  type InviteStatus,
} from './invite-status';

const DAY = 24 * 3600_000;
const DEFAULT_EXPIRES_DAYS = 7;

export interface InviteView {
  id: string;
  code: string;
  email: string;
  note: string;
  status: InviteStatus;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  createdByEmail: string | null;
  usedByEmail: string | null;
}

const INVITE_INCLUDE = {
  createdBy: { select: { email: true } },
  usedBy: { select: { email: true } },
} satisfies Prisma.InviteInclude;

type InviteWithRelations = Prisma.InviteGetPayload<{ include: typeof INVITE_INCLUDE }>;

/**
 * 邀请码：一码一邮箱、限时、限用一次（docs/architecture.md §5.1）。
 * 注册侧（AuthService.register）负责消费邀请码；这里只负责生成、查询、删除。
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger('Invites');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, dto: CreateInviteDto, ip: string): Promise<InviteView> {
    const email = normalizeEmail(dto.email);
    const expiresInDays = dto.expiresInDays ?? DEFAULT_EXPIRES_DAYS;

    const pending = await this.prisma.invite.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pending) {
      throw Errors.conflict('INVITE_EMAIL_PENDING', '该邮箱已有未使用的邀请码，请先删除或等其过期');
    }

    const expiresAt = new Date(Date.now() + expiresInDays * DAY);
    const note = (dto.note ?? '').slice(0, 200);

    // code 是唯一索引：撞码（概率极低）时换一个再试，而不是把 500 抛给管理员
    let created: InviteWithRelations | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        created = await this.prisma.invite.create({
          data: { code: randomInviteCode(), email, note, createdById: actor.id, expiresAt },
          include: INVITE_INCLUDE,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (!created) throw Errors.internal('生成邀请码失败，请重试');

    await this.audit.record({
      actorId: actor.id,
      action: 'INVITE_CREATE',
      targetType: 'invite',
      targetId: created.id,
      detail: `邀请码 ${created.code} → ${email}（${expiresInDays} 天有效）`,
      ip,
    });
    this.logger.log(`邀请码已生成 ${created.code} → ${email} by=${actor.email}`);

    return toInviteView(created);
  }

  async list(query: InviteQueryDto): Promise<Paged<InviteView>> {
    const now = new Date();
    const where: Prisma.InviteWhereInput = {};
    if (query.status === InviteStatusFilter.used) {
      where.usedAt = { not: null };
    } else if (query.status === InviteStatusFilter.expired) {
      where.usedAt = null;
      where.expiresAt = { lte: now };
    } else if (query.status === InviteStatusFilter.unused) {
      where.usedAt = null;
      where.expiresAt = { gt: now };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invite.findMany({
        where,
        include: INVITE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.invite.count({ where }),
    ]);

    return paged(rows.map(toInviteView), total, query);
  }

  async remove(actor: AuthUser, id: string, ip: string): Promise<{ deleted: true }> {
    const invite = await this.prisma.invite.findUnique({ where: { id } });
    if (!invite) throw Errors.notFound('邀请码不存在');
    if (invite.usedAt) {
      throw Errors.conflict('INVITE_USED', '邀请码已被使用，不能删除');
    }

    await this.prisma.invite.delete({ where: { id } });

    await this.audit.record({
      actorId: actor.id,
      action: 'INVITE_DELETE',
      targetType: 'invite',
      targetId: id,
      detail: `删除邀请码 ${invite.code}（${invite.email}）`,
      ip,
    });
    this.logger.log(`邀请码已删除 ${invite.code} by=${actor.email}`);

    return { deleted: true };
  }
}

function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toInviteView(invite: InviteWithRelations): InviteView {
  return {
    id: invite.id,
    code: invite.code,
    email: invite.email,
    note: invite.note,
    status: inviteStatusOf(invite),
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    usedAt: invite.usedAt,
    createdByEmail: invite.createdBy?.email ?? null,
    usedByEmail: invite.usedBy?.email ?? null,
  };
}
