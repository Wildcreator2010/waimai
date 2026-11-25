import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * PATCH /api/admin/settings 的入参。
 * 全局 ValidationPipe 开了 `forbidNonWhitelisted`，未在下面声明的字段直接 400，
 * 所以这里不写 `[key: string]: unknown`，也不做动态遍历。
 * 范围与 `setting-keys.ts` 的 SETTING_DEFS 保持一致（服务层再校验一次，防止绕过控制器）。
 */
export class UpdateSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pollIntervalSec 必须是整数' })
  @Min(10, { message: 'pollIntervalSec 不能小于 10 秒' })
  @Max(3600, { message: 'pollIntervalSec 不能大于 3600 秒' })
  pollIntervalSec?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'defaultDurationMin 必须是整数' })
  @Min(1, { message: 'defaultDurationMin 不能小于 1 分钟' })
  @Max(720, { message: 'defaultDurationMin 不能大于 720 分钟' })
  defaultDurationMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxDurationMin 必须是整数' })
  @Min(1, { message: 'maxDurationMin 不能小于 1 分钟' })
  @Max(720, { message: 'maxDurationMin 不能大于 720 分钟' })
  maxDurationMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxActiveRemindersPerUser 必须是整数' })
  @Min(1, { message: 'maxActiveRemindersPerUser 不能小于 1' })
  @Max(100, { message: 'maxActiveRemindersPerUser 不能大于 100' })
  maxActiveRemindersPerUser?: number;

  @IsOptional()
  @IsString({ message: 'lockerDeviceSn 必须是字符串' })
  @MaxLength(32, { message: 'lockerDeviceSn 最长 32 字符' })
  @Matches(/\S/, { message: 'lockerDeviceSn 不能为空' })
  lockerDeviceSn?: string;

  @IsOptional()
  @IsString({ message: 'defaultLockerCabCode 必须是字符串' })
  @MaxLength(32, { message: 'defaultLockerCabCode 最长 32 字符' })
  @Matches(/\S/, { message: 'defaultLockerCabCode 不能为空' })
  defaultLockerCabCode?: string;

  @IsOptional()
  @IsString({ message: 'lockerApiBase 必须是字符串' })
  @MaxLength(200)
  @Matches(/^https?:\/\/\S+$/i, { message: 'lockerApiBase 必须是 http(s) 地址' })
  lockerApiBase?: string;

  @IsOptional()
  @IsString({ message: 'ntfyServerUrl 必须是字符串' })
  @MaxLength(200)
  @Matches(/^https?:\/\/\S+$/i, { message: 'ntfyServerUrl 必须是 http(s) 地址' })
  ntfyServerUrl?: string;

  @IsOptional()
  @IsBoolean({ message: 'registrationOpen 必须是布尔值' })
  registrationOpen?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'showNotifyDetailsDefault 必须是布尔值' })
  showNotifyDetailsDefault?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'openBoxWindowHours 必须是整数' })
  @Min(1, { message: 'openBoxWindowHours 不能小于 1 小时' })
  @Max(168, { message: 'openBoxWindowHours 不能大于 168 小时' })
  openBoxWindowHours?: number;
}
