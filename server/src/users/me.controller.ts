import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { CurrentUser, type AuthUser } from '../common/decorators';
import { CaptchaGuard } from '../captcha/captcha.guard';
import { CaptchaPurpose } from '../captcha/captcha.decorator';

class DeleteSelfDto {
  @IsString()
  @MinLength(1, { message: '请输入密码以确认' })
  @MaxLength(128)
  password!: string;
}
import {
  RegisterDeviceDto,
  RequestPhoneCodeDto,
  UpdateMySettingsDto,
  VerifyPhoneDto,
} from './dto';
import { UsersService } from './users.service';

/**
 * 当前用户自己的数据（`/api/me/*`）。
 * 一律用 `@CurrentUser()` 取身份，URL 里不出现 userId，从根上避免越权。
 */
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.users.meSettings(user);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateMySettingsDto) {
    return this.users.updateMySettings(user, dto);
  }

  @UseGuards(CaptchaGuard)
  @CaptchaPurpose('phone')
  @Post('phone/request-code')
  @HttpCode(202)
  requestPhoneCode(@CurrentUser() user: AuthUser, @Body() dto: RequestPhoneCodeDto) {
    return this.users.requestPhoneCode(user, dto);
  }

  @Post('phone/verify')
  @HttpCode(200)
  verifyPhone(@CurrentUser() user: AuthUser, @Body() dto: VerifyPhoneDto) {
    return this.users.verifyPhone(user, dto);
  }

  @Post('phone/unbind')
  @HttpCode(200)
  unbindPhone(@CurrentUser() user: AuthUser) {
    return this.users.unbindPhone(user);
  }

  @Get('ntfy/config')
  ntfyConfig(@CurrentUser() user: AuthUser) {
    return this.users.ntfyConfig(user);
  }

  @Post('ntfy/rotate')
  @HttpCode(200)
  rotateNtfy(@CurrentUser() user: AuthUser) {
    return this.users.rotateNtfy(user);
  }

  @Get('devices')
  listDevices(@CurrentUser() user: AuthUser) {
    return this.users.listDevices(user);
  }

  @Post('devices')
  @HttpCode(201)
  registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.users.registerDevice(user, dto);
  }

  @Delete('devices/:id')
  @HttpCode(200)
  deleteDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.deleteDevice(user, id);
  }

  /** 注销当前账号（需密码确认；ROOT 不允许自我注销） */
  @Post('delete')
  @HttpCode(200)
  deleteSelf(@CurrentUser() user: AuthUser, @Body() dto: DeleteSelfDto) {
    return this.users.deleteSelf(user, dto.password);
  }
}
