import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ReminderStatus } from '@prisma/client';

export class CreateReminderDto {
  /**
   * 取餐码来源：
   * - custom：用户自定义字符串（默认）
   * - phone_tail：手机尾号后四位，服务端强制 4 位数字
   */
  @IsOptional()
  @IsIn(['custom', 'phone_tail'], { message: 'codeMode 只能是 custom 或 phone_tail' })
  codeMode?: 'custom' | 'phone_tail';

  /** 取餐码：用户自定义，任意字符串；phone_tail 模式必须是 4 位数字 */
  @IsString()
  @MinLength(1, { message: '请填写取餐码' })
  @MaxLength(64)
  pickupCode!: string;

  /** 柜机 cabCode */
  @IsString()
  @MinLength(1, { message: '请填写柜机 cabCode' })
  @MaxLength(32)
  cabCode!: string;

  /** 监控时长（分钟），省略时用系统默认值 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '时长必须是整数分钟' })
  @Min(1, { message: '时长至少 1 分钟' })
  @Max(720, { message: '时长最多 720 分钟' })
  durationMin?: number;
}

export class ListRemindersQuery {
  @IsOptional()
  @IsEnum(ReminderStatus, { message: '状态不合法' })
  status?: ReminderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }
}
