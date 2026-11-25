import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { SmsStatus } from '@prisma/client';

import { PaginationQuery } from '../common/dto/pagination.dto';

/** `YYYY-MM-DD` 或完整 ISO-8601 时间戳 */
const DATE_BOUND = /^\d{4}-\d{2}-\d{2}([T ].+)?$/;

export class AlertQueryDto extends PaginationQuery {
  /** 查询串里是字符串 'true'/'false'，这里显式转换，避免被当成真值字符串 */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean({ message: 'acked 只能是 true 或 false' })
  acked?: boolean;
}

export class AuditQueryDto extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorId?: string;

  @IsOptional()
  @Matches(DATE_BOUND, { message: 'from 需为 YYYY-MM-DD 或 ISO-8601 时间' })
  from?: string;

  @IsOptional()
  @Matches(DATE_BOUND, { message: 'to 需为 YYYY-MM-DD 或 ISO-8601 时间' })
  to?: string;
}

export class SmsLogQueryDto extends PaginationQuery {
  @IsOptional()
  @IsEnum(SmsStatus, { message: 'status 只能是 SENT / FAILED / SKIPPED' })
  status?: SmsStatus;

  /** 精确匹配；允许带空格/横线，服务层归一化后再比 */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @Matches(DATE_BOUND, { message: 'from 需为 YYYY-MM-DD 或 ISO-8601 时间' })
  from?: string;

  @IsOptional()
  @Matches(DATE_BOUND, { message: 'to 需为 YYYY-MM-DD 或 ISO-8601 时间' })
  to?: string;
}
