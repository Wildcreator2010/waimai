import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { sha256Hex } from '../src/common/crypto/tokens';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';

/** 捕获 dry-run 邮件里的链接，从而拿到验证令牌。 */
class FakeMailService {
  readonly sent: Array<{ to: string; subject: string; text: string }> = [];

  async send(to: string, subject: string, text: string): Promise<void> {
    this.sent.push({ to, subject, text });
  }
  async sendVerifyEmail(to: string, link: string): Promise<void> {
    this.sent.push({ to, subject: 'verify', text: link });
  }
  async sendResetEmail(to: string, link: string): Promise<void> {
    this.sent.push({ to, subject: 'reset', text: link });
  }
  async sendAdminAlert(to: string, title: string, body: string): Promise<void> {
    this.sent.push({ to, subject: title, text: body });
  }
  lastLink(): string {
    const last = [...this.sent].reverse().find((m) => m.text.includes('token='));
    return last?.text ?? '';
  }
}

describe('取餐提醒 · 端到端', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: FakeMailService;
  let rootToken = '';
  let userToken = '';
  let refreshToken = '';
  let inviteCode = '';
  let reminderId = '';

  beforeAll(async () => {
    // 必须在应用启动前清库：BootstrapService 在 onModuleInit 里判断是否已有 ROOT，
    // 若残留上一次运行的 ROOT，引导码就不会生成，后续全部用例会连锁失败。
    const cleanup = new PrismaService();
    await cleanup.$connect();
    await cleanup.truncateAll();
    await cleanup.$disconnect();

    mail = new FakeMailService();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('健康检查可用', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
  });

  it('首次部署需要引导', async () => {
    const res = await request(app.getHttpServer()).get('/api/bootstrap/status').expect(200);
    expect(res.body.needsBootstrap).toBe(true);
  });

  it('引导码错误时拒绝创建 ROOT', async () => {
    await request(app.getHttpServer())
      .post('/api/bootstrap')
      .send({ setupCode: 'WRONG-CODE', email: 'root@test.com', password: 'root12345' })
      .expect(403);
  });

  it('正确引导码创建 ROOT，且引导入口随后关闭', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bootstrap')
      .send({ setupCode: 'TEST-CODE', email: 'root@test.com', password: 'root12345', displayName: '根' })
      .expect(201);
    expect(res.body.user.role).toBe('ROOT');
    expect(res.body.user.email).toBe('root@test.com');

    const again = await request(app.getHttpServer()).get('/api/bootstrap/status').expect(200);
    expect(again.body.needsBootstrap).toBe(false);
  });

  it('ROOT 可登录并拿到 access/refresh', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-client', 'app')
      .send({ email: 'root@test.com', password: 'root12345' })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    rootToken = res.body.accessToken;
  });

  it('错误密码返回 INVALID_CREDENTIALS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'root@test.com', password: 'wrong12345' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('ROOT 生成绑定邮箱的邀请码', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/invites')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ email: 'user@test.com', expiresInDays: 7 })
      .expect(201);
    expect(res.body.code).toMatch(/^INV-/);
    inviteCode = res.body.code;
  });

  it('邀请码与邮箱不匹配时拒绝注册', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'other@test.com', password: 'user12345', inviteCode, acceptTerms: true })
      .expect(403);
    expect(res.body.code).toBe('INVITE_EMAIL_MISMATCH');
  });

  it('注册成功后未验证邮箱不能登录', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'user@test.com', password: 'user12345', inviteCode, acceptTerms: true })
      .expect(202);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'user12345' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('邮箱验证后可以登录', async () => {
    const link = mail.lastLink();
    expect(link).toContain('token=');
    const token = decodeURIComponent(link.split('token=')[1]);

    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-client', 'app')
      .send({ email: 'user@test.com', password: 'user12345' })
      .expect(200);
    userToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    expect(res.body.user.role).toBe('USER');
  });

  it('refresh 轮换后旧令牌失效', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('x-client', 'app')
      .send({ refreshToken })
      .expect(200);
    expect(first.body.refreshToken).toBeTruthy();
    expect(first.body.refreshToken).not.toBe(refreshToken);

    const reused = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('x-client', 'app')
      .send({ refreshToken })
      .expect(401);
    expect(reused.body.code).toBe('REFRESH_REVOKED');

    refreshToken = first.body.refreshToken;
    userToken = first.body.accessToken;
  });

  it('未绑定手机号时创建提醒会带 PHONE_NOT_BOUND 警告', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/reminders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ pickupCode: '1234', cabCode: 'SYA61026AP', durationMin: 30 })
      .expect(201);
    expect(res.body.warnings?.[0]?.code).toBe('PHONE_NOT_BOUND');
    reminderId = res.body.id;
  });

  it('第一次查询只记录基线，不提醒', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/reminders/${reminderId}/check`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(res.body.baseline).toBe(true);
    expect(res.body.arrived).toBe(false);
  });

  it('第二次查询命中入柜并完成三通道分发', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/reminders/${reminderId}/check`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(res.body.arrived).toBe(true);
    expect(res.body.cabinet).toBe('A-07');
    // 未绑定手机号 → 短信不发送；FCM 未配置 → 跳过
    expect(res.body.notify.sms.attempted).toBe(false);

    const detail = await request(app.getHttpServer())
      .get(`/api/reminders/${reminderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(detail.body.status).toBe('ARRIVED');
    expect(detail.body.events.length).toBeGreaterThan(0);
  });

  it('普通用户无权访问 MemberToken', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/member-token')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('管理员可更新 MemberToken 且写入审计', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/admin/member-token')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ token: 'mock-member-token-value-123456' })
      .expect(200);
    expect(res.body.status.configured).toBe(true);
    expect(res.body.status.masked).toContain('…');
    expect(res.body.status.masked).not.toContain('mock-member-token-value-123456');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'MEMBER_TOKEN_UPDATE' } });
    expect(audit).not.toBeNull();
  });

  it('普通用户看不到他人的提醒', async () => {
    const rootList = await request(app.getHttpServer())
      .get('/api/reminders')
      .set('Authorization', `Bearer ${rootToken}`)
      .expect(200);
    expect(rootList.body.items).toHaveLength(0);
  });

  it('个人设置可读可改', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/me/settings')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(before.body.showNotifyDetails).toBe(true);

    const after = await request(app.getHttpServer())
      .patch('/api/me/settings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ showNotifyDetails: false, ntfyEnabled: true })
      .expect(200);
    expect(JSON.stringify(after.body)).toContain('false');
  });

  it('未配置验证码模板时绑定手机号返回 503', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/me/phone/request-code')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ phone: '13800138000' })
      .expect(503);
    expect(res.body.code).toBe('SMS_TEMPLATE_NOT_CONFIGURED');
  });

  it('写入验证令牌后可完成手机号绑定（掩码展示）', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'user@test.com' } });
    const code = '123456';
    const phone = '13800138000';
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'PHONE_VERIFY',
        tokenHash: sha256Hex(`${user.id}:${phone}:${code}`),
        meta: phone,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    await request(app.getHttpServer())
      .post('/api/me/phone/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ phone, code })
      .expect(200);

    const settings = await request(app.getHttpServer())
      .get('/api/me/settings')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(settings.body.phoneVerified).toBe(true);
    expect(settings.body.phone).toBe('138****8000');
  });

  it('已绑定手机号后，入柜必发短信（dry-run 计为 SENT）', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/reminders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ pickupCode: '5678', cabCode: 'SYA61026AP', durationMin: 30 })
      .expect(201);
    const id = created.body.id;

    await request(app.getHttpServer())
      .post(`/api/reminders/${id}/check`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const hit = await request(app.getHttpServer())
      .post(`/api/reminders/${id}/check`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(hit.body.arrived).toBe(true);
    expect(hit.body.notify.sms.attempted).toBe(true);
    // 短信走异步队列：这里只断言「已入队」，最终结果稍后从 SmsLog 确认
    expect(hit.body.notify.sms.queued).toBe(true);

    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: 'user@test.com' } })).id;
    const deadline = Date.now() + 15_000;
    let smsLog = null;
    while (Date.now() < deadline) {
      smsLog = await prisma.smsLog.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (smsLog?.status === 'SENT') break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(smsLog?.status).toBe('SENT');
    expect(smsLog?.phone).toBe('13800138000');
  });

  it('ntfy topic 可重置且为 32 位十六进制', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/me/ntfy/rotate')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(res.body.topic).toMatch(/^[0-9a-f]{32}$/);

    const config = await request(app.getHttpServer())
      .get('/api/me/ntfy/config')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(config.body.topic).toBe(res.body.topic);
    expect(String(config.body.serverUrl)).toMatch(/^wss?:\/\//);
  });

  it('设备可注册、列出、删除', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/me/devices')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Pixel 7', platform: 'android', pushMode: 'NTFY', appVersion: '1.0.0' })
      .expect(201);
    const createdItems = Array.isArray(created.body)
      ? created.body
      : (created.body.items ?? [created.body]);
    expect(createdItems[0].pushMode).toBe('NTFY');

    const list = await request(app.getHttpServer())
      .get('/api/me/devices')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const items = Array.isArray(list.body) ? list.body : list.body.items;
    expect(items.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .delete(`/api/me/devices/${createdItems[0].id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('管理员可读改系统设置，且调度器读取同一份值', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${rootToken}`)
      .expect(200);
    expect(before.body.pollIntervalSec).toBe(60);

    const after = await request(app.getHttpServer())
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ pollIntervalSec: 30 })
      .expect(200);
    expect(JSON.stringify(after.body)).toContain('30');

    const row = await prisma.systemSetting.findUnique({ where: { key: 'pollIntervalSec' } });
    expect(row?.value).toBe('30');
  });

  it('管理员可看概览、审计、短信流水、告警', async () => {
    const overview = await request(app.getHttpServer())
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${rootToken}`)
      .expect(200);
    expect(overview.body.users.total).toBeGreaterThanOrEqual(2);

    const audit = await request(app.getHttpServer())
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${rootToken}`)
      .expect(200);
    const auditItems = Array.isArray(audit.body) ? audit.body : audit.body.items;
    expect(auditItems.some((row: { action: string }) => row.action === 'MEMBER_TOKEN_UPDATE')).toBe(true);

    await request(app.getHttpServer())
      .get('/api/admin/sms-logs')
      .set('Authorization', `Bearer ${rootToken}`)
      .expect(200);

    for (const acked of ['false', 'true', '']) {
      const q = acked ? `?acked=${acked}` : '';
      await request(app.getHttpServer())
        .get(`/api/admin/alerts${q}`)
        .set('Authorization', `Bearer ${rootToken}`)
        .expect(200);
    }
  });

  it('停用账号后其令牌立即失效', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: 'user@test.com' } });

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ status: 'DISABLED' })
      .expect(200);

    const blocked = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    expect(blocked.body.code).toBe('ACCOUNT_DISABLED');

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);
  });

  it('只有 ROOT 能改角色，且不能动 ROOT 自己', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: 'user@test.com' } });
    const root = await prisma.user.findUniqueOrThrow({ where: { email: 'root@test.com' } });

    // 重新登录拿一个可用的用户令牌（之前被停用又启用，令牌因 sessionVersion 已失效）
    const relogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-client', 'app')
      .send({ email: 'user@test.com', password: 'user12345' })
      .expect(200);
    const freshUserToken = relogin.body.accessToken;

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${root.id}`)
      .set('Authorization', `Bearer ${freshUserToken}`)
      .send({ role: 'USER' })
      .expect(403);

    const promoted = await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    expect(JSON.stringify(promoted.body)).toContain('ADMIN');

    // 复原为 USER，避免影响后续用例（如测试推送的权限判定）
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ role: 'USER' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${root.id}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ role: 'ADMIN' })
      .expect(403);
  });

  it('管理员可向自己发送测试推送，普通用户被拒绝', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/notifications/test')
      .set('Authorization', `Bearer ${rootToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('fcm');
    expect(res.body).toHaveProperty('ntfy');
    // 测试推送不发短信
    expect(res.body.sms.attempted).toBe(false);

    const relogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-client', 'app')
      .send({ email: 'user@test.com', password: 'user12345' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/admin/notifications/test')
      .set('Authorization', `Bearer ${relogin.body.accessToken}`)
      .expect(403);
  });

  it('已入柜任务可一键开箱，10 秒内重复调用被限流', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-client', 'app')
      .send({ email: 'user@test.com', password: 'user12345' })
      .expect(200);
    const token = login.body.accessToken;

    const opened = await request(app.getHttpServer())
      .post(`/api/reminders/${reminderId}/open`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(opened.body.ok).toBe(true);
    expect(opened.body.openCount).toBe(1);

    const again = await request(app.getHttpServer())
      .post(`/api/reminders/${reminderId}/open`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    expect(again.body.code).toBe('OPEN_TOO_FREQUENT');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'LOCKER_OPEN' } });
    expect(audit).not.toBeNull();
  });

  it('未入柜的任务不能开箱', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-client', 'app')
      .send({ email: 'user@test.com', password: 'user12345' })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/api/reminders')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ pickupCode: '9999', cabCode: 'SYA61026AP', durationMin: 30 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/reminders/${created.body.id}/open`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(409);
    expect(res.body.code).toBe('REMINDER_NOT_ARRIVED');
  });

  it('手机尾号模式只接受 4 位数字，且个人设置下发表单默认值', async () => {
    // 前面「停用账号」用例让 sessionVersion 递增，旧 access token 已失效，重新登录
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-client', 'app')
      .send({ email: 'user@test.com', password: 'user12345' })
      .expect(200);
    const token = login.body.accessToken;

    const settings = await request(app.getHttpServer())
      .get('/api/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(typeof settings.body.defaultCabCode).toBe('string');
    expect(settings.body.defaultDurationMin).toBeGreaterThan(0);
    expect(settings.body.maxDurationMin).toBeGreaterThanOrEqual(settings.body.defaultDurationMin);

    const bad = await request(app.getHttpServer())
      .post('/api/reminders')
      .set('Authorization', `Bearer ${token}`)
      .send({ codeMode: 'phone_tail', pickupCode: '123', cabCode: 'SYA61026AP', durationMin: 30 })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');

    const ok = await request(app.getHttpServer())
      .post('/api/reminders')
      .set('Authorization', `Bearer ${token}`)
      .send({ codeMode: 'phone_tail', pickupCode: '8000', cabCode: 'SYA61026AP', durationMin: 30 })
      .expect(201);
    expect(ok.body.pickupCode).toBe('8000');
  });
});
