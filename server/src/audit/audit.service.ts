import { Injectable, Logger } from '@nestjs/common';
import { AlertLevel, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  ip?: string;
}

/**
 * 审计与管理员告警。
 * - 审计：角色变更、MemberToken、系统设置、邀请码、告警确认等敏感动作。
 * - 告警：短信失败、MemberToken 失效、轮询异常。落库（站内）+ 邮件给 ROOT。
 *   按你的要求不发 ntfy，避免打扰。
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          targetType: input.targetType ?? '',
          targetId: input.targetId ?? '',
          detail: (input.detail ?? '').slice(0, 1000),
          ip: (input.ip ?? '').slice(0, 64),
        },
      });
    } catch (error) {
      // 审计失败不能影响主流程，但必须留痕到应用日志
      this.logger.error(`审计写入失败 action=${input.action} ${(error as Error).message}`);
    }
  }

  /** 产生告警：落库 + 邮件通知 ROOT。同一 type+message 在 30 分钟内只发一次邮件，防轰炸。 */
  async alert(level: AlertLevel, type: string, message: string): Promise<void> {
    try {
      const recent = await this.prisma.adminAlert.findFirst({
        where: {
          type,
          message,
          createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
        },
        select: { id: true },
      });
      if (recent) return;

      await this.prisma.adminAlert.create({ data: { level, type, message } });

      const root = await this.prisma.user.findFirst({
        where: { role: Role.ROOT },
        select: { email: true },
      });
      if (root?.email) {
        await this.mail.sendAdminAlert(root.email, type, message);
      }
    } catch (error) {
      this.logger.error(`告警处理失败 type=${type} ${(error as Error).message}`);
    }
  }
}
