/**
 * 业务错误：携带稳定 code，前端据此分支，不依赖中文文案。
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (msg = '参数不合法', details: unknown = null) =>
    new AppError('VALIDATION_FAILED', msg, 400, details),
  unauthenticated: (msg = '请先登录') => new AppError('UNAUTHENTICATED', msg, 401),
  tokenExpired: () => new AppError('TOKEN_EXPIRED', '登录已过期，请重新登录', 401),
  forbidden: (msg = '没有权限') => new AppError('FORBIDDEN', msg, 403),
  notFound: (msg = '资源不存在') => new AppError('NOT_FOUND', msg, 404),
  conflict: (code: string, msg: string) => new AppError(code, msg, 409),
  tooMany: (msg = '操作过于频繁，请稍后再试') => new AppError('TOO_MANY_REQUESTS', msg, 429),
  internal: (msg = '服务端内部错误') => new AppError('INTERNAL', msg, 500),
};
