import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { PushMode, Role } from '@prisma/client';

import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { FcmService } from './fcm.service';
import { NotificationsService } from './notifications.service';

/**
 * 管理员自助测试推送：只发给自己的设备，不发短信。
 * 用途：配好 FCM / ntfy 后先确认通道可用，再排障任务。
 */
@Controller('admin/notifications')
@Roles(Role.ADMIN, Role.ROOT)
export class TestPushController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser() actor: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    return this.notifications.sendTest(user);
  }

  /** FCM 配置与设备状态，用于排障（不暴露密钥） */
  @Get('fcm/status')
  async fcmStatus() {
    const [devices, fcmDevices] = await this.prisma.$transaction([
      this.prisma.device.count(),
      this.prisma.device.count({ where: { pushMode: PushMode.FCM } }),
    ]);
    const enabled = this.fcm.isEnabled();
    return {
      enabled,
      deviceCount: devices,
      fcmDeviceCount: fcmDevices,
      hint: enabled
        ? 'FCM 已启用：请在手机上确认 pushMode=FCM，并调用 POST /api/admin/notifications/test 验证投递'
        : 'FCM 未配置：全部设备走 ntfy。配置 FIREBASE_SERVICE_ACCOUNT_PATH 后重启即可启用',
    };
  }
}
