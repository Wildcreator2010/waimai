import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

import { AppError } from '../errors';

/**
 * 统一错误出口。约束：
 * - 响应体固定 { code, message, details }
 * - 绝不回显堆栈、SQL、密码、token
 * - 5xx 才记 error 日志，4xx 记 warn
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = '服务端内部错误';
    let details: unknown = null;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        const rawMessage = obj.message;
        if (Array.isArray(rawMessage)) {
          code = 'VALIDATION_FAILED';
          message = '参数不合法';
          details = rawMessage;
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
          code = typeof obj.code === 'string' ? obj.code : mapStatusToCode(status);
        } else {
          code = typeof obj.code === 'string' ? obj.code : mapStatusToCode(status);
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = '数据已存在';
        details = exception.meta?.target ?? null;
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = '资源不存在';
      } else {
        this.logger.error(`Prisma ${exception.code}`);
      }
    } else {
      this.logger.error(
        `未捕获异常: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (status >= 500) {
      this.logger.error(`${status} ${code} ${message}`);
    } else if (status >= 400) {
      this.logger.warn(`${status} ${code} ${message}`);
    }

    response.status(status).json({ code, message, details });
  }
}

function mapStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'INTERNAL';
  }
}
