import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PushMode, Role, UserStatus } from '@prisma/client';

import { PaginationQuery } from '../common/dto/pagination.dto';

/** 手机号宽松校验：真正的归一化在服务层用 `normalizePhone` 做，这里只挡住明显不是号码的输入。 */
const PHONE_PATTERN = /^[+]?[\d\s-]{6,20}$/;

// ------------------------------------------------------------ 当前用户

export class UpdateMySettingsDto {
  @IsOptional()
  @IsBoolean({ message: 'showNotifyDetails 必须是布尔值' })
  showNotifyDetails?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'smsEnabled 必须是布尔值' })
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'ntfyEnabled 必须是布尔值' })
  ntfyEnabled?: boolean;
}

export class RequestPhoneCodeDto {
  @IsString({ message: '请填写手机号' })
  @Matches(PHONE_PATTERN, { message: '手机号格式不正确' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  captchaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  captchaAnswer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

export class VerifyPhoneDto {
  @IsString({ message: '请填写手机号' })
  @Matches(PHONE_PATTERN, { message: '手机号格式不正确' })
  phone!: string;

  @IsString({ message: '请填写验证码' })
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;
}

export class RegisterDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string;

  @IsEnum(PushMode, { message: 'pushMode 只能是 FCM 或 NTFY' })
  pushMode!: PushMode;

  /** 无 GMS 设备传 null；有 GMS 传 FCM token */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  fcmToken?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}

// ------------------------------------------------------------ 管理员

export class AdminUserQueryDto extends PaginationQuery {
  /** 邮箱 / 昵称 / 手机号 模糊匹配 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'role 只能是 ROOT / ADMIN / USER' })
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'status 只能是 PENDING_VERIFICATION / ACTIVE / DISABLED' })
  status?: UserStatus;
}

export class CreateUserDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsEnum(Role, { message: 'role 只能是 ADMIN / USER' })
  role?: Role;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayName?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayName?: string;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'status 只能是 PENDING_VERIFICATION / ACTIVE / DISABLED' })
  status?: UserStatus;

  @IsOptional()
  @IsEnum(Role, { message: 'role 只能是 ROOT / ADMIN / USER' })
  role?: Role;
}
