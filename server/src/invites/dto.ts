import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQuery } from '../common/dto/pagination.dto';
import { InviteStatusFilter } from './invite-status';

export class CreateInviteDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'expiresInDays 必须是整数' })
  @Min(1, { message: 'expiresInDays 最小为 1 天' })
  @Max(365, { message: 'expiresInDays 最大为 365 天' })
  expiresInDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class InviteQueryDto extends PaginationQuery {
  @IsOptional()
  @IsEnum(InviteStatusFilter, { message: 'status 只能是 unused / used / expired' })
  status?: InviteStatusFilter;
}
