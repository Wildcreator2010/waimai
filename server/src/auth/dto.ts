import { Equals, IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128)
  password!: string;

  @IsString()
  @Length(4, 64, { message: '邀请码长度不正确' })
  inviteCode!: string;

  /** 必须勾选用户协议 */
  @Equals(true, { message: '请先阅读并同意用户协议' })
  acceptTerms!: boolean;

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

export class LoginDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString()
  @MinLength(1, { message: '请输入密码' })
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(10)
  token!: string;
}

export class EmailOnlyDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

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

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: '请输入当前密码' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @MaxLength(128)
  newPassword!: string;
}

export class BootstrapDto {
  @IsString()
  @Length(4, 32, { message: '引导码格式不正确' })
  setupCode!: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayName?: string;
}

export class TransferRootDto {
  @IsString()
  userId!: string;

  @IsString()
  @MinLength(1, { message: '请输入你的密码以确认' })
  password!: string;
}
