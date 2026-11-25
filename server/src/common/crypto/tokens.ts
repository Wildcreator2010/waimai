import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** 32 字节 URL 安全随机串，用于 refresh token 与一次性令牌。 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** 短随机串，用于引导码（XXXX-XXXX，去掉易混字符）。 */
export function randomSetupCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () =>
    Array.from(randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return `${pick()}-${pick()}`;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function uuid(): string {
  return randomUUID();
}

/** ntfy topic：32 位十六进制，不可猜。 */
export function randomTopic(): string {
  return randomBytes(16).toString('hex');
}

/** 6 位数字验证码。 */
export function randomNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomBytes(4).readUInt32BE(0) % max).padStart(digits, '0');
}
