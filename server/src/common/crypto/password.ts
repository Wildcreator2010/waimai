import { pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(pbkdf2Cb) as (
  password: string | Buffer,
  salt: Buffer,
  iterations: number,
  keylen: number,
  digest: string,
) => Promise<Buffer>;

/** PBKDF2-HMAC-SHA512 参数。迭代次数随硬件升级只增不减，旧哈希按各自记录的次数校验。 */
export const DEFAULT_ITERATIONS = 210_000;
export const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export interface StoredPassword {
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
}

async function derive(password: string, saltHex: string, iterations: number): Promise<Buffer> {
  return pbkdf2(password, Buffer.from(saltHex, 'hex'), iterations, KEY_LENGTH, DIGEST);
}

/** 生成入库三元组；密码明文只在调用栈内存在，不落任何日志。 */
export async function hashPassword(
  password: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<StoredPassword> {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, iterations);
  return {
    passwordHash: hash.toString('hex'),
    passwordSalt: salt,
    passwordIterations: iterations,
  };
}

/** 恒定时比较，避免通过响应时间推断密码前缀。 */
export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  const computed = await derive(password, stored.passwordSalt, stored.passwordIterations);
  const expected = Buffer.from(stored.passwordHash, 'hex');
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

/** 强度校验：至少 8 位，且同时含字母与数字。 */
export function assertPasswordStrength(password: string): void {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('密码长度需为 8-128 位');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('密码需同时包含字母和数字');
  }
}
