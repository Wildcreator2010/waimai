import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * 邮件发送。开发模式（MAIL_DRY_RUN=true）只打日志，方便本地跑通注册流程。
 * 约束：日志里不出现密码；验证链接本身是凭据，只在 dry-run 下打印，且标注清楚。
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly dryRun: boolean;

  constructor(config: ConfigService) {
    this.from = config.get<string>('SMTP_FROM', '取餐提醒 <no-reply@example.com>');
    this.dryRun = config.get<boolean>('MAIL_DRY_RUN', true);
    const host = config.get<string>('SMTP_HOST', '');
    if (!this.dryRun && host) {
      this.transporter = createTransport({
        host,
        port: config.get<number>('SMTP_PORT', 465),
        secure: config.get<boolean>('SMTP_SECURE', true),
        auth: {
          user: config.get<string>('SMTP_USER', ''),
          pass: config.get<string>('SMTP_PASS', ''),
        },
      });
    } else {
      this.transporter = null;
    }
    this.logger.log(
      this.transporter ? 'SMTP 已启用' : 'SMTP 未启用（dry-run 或未配置），邮件只写日志',
    );
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[MAIL-DRY-RUN] to=${to} subject=${subject}\n${text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }

  async sendVerifyEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      '验证你的取餐提醒邮箱',
      [
        '你好，',
        '',
        '请点击下面的链接完成邮箱验证（1 小时内有效）：',
        link,
        '',
        '如果这不是你本人的操作，忽略本邮件即可。',
      ].join('\n'),
      `<p>你好，</p><p>请点击下面的链接完成邮箱验证（1 小时内有效）：</p><p><a href="${link}">${link}</a></p><p>如果这不是你本人的操作，忽略本邮件即可。</p>`,
    );
  }

  async sendResetEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      '重置你的取餐提醒密码',
      [
        '你好，',
        '',
        '请点击下面的链接重置密码（1 小时内有效）：',
        link,
        '',
        '如果不是你本人操作，请忽略本邮件，你的密码不会被修改。',
      ].join('\n'),
      `<p>你好，</p><p>请点击下面的链接重置密码（1 小时内有效）：</p><p><a href="${link}">${link}</a></p><p>如果不是你本人操作，请忽略本邮件。</p>`,
    );
  }

  async sendAdminAlert(to: string, title: string, body: string): Promise<void> {
    await this.send(to, `[取餐提醒·告警] ${title}`, body);
  }
}
