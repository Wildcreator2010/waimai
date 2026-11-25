import {
  assertPasswordStrength,
  hashPassword,
  verifyPassword,
  DEFAULT_ITERATIONS,
} from './password';

// 迭代次数降到 1000 只为让测试快；生产走 DEFAULT_ITERATIONS。
const FAST_ITERATIONS = 1000;

describe('密码哈希（PBKDF2-HMAC-SHA512）', () => {
  it('同一密码可被校验通过', async () => {
    const stored = await hashPassword('abc12345', FAST_ITERATIONS);
    await expect(verifyPassword('abc12345', stored)).resolves.toBe(true);
  });

  it('错误密码校验失败', async () => {
    const stored = await hashPassword('abc12345', FAST_ITERATIONS);
    await expect(verifyPassword('abc12346', stored)).resolves.toBe(false);
  });

  it('相同密码两次哈希得到不同盐与不同摘要', async () => {
    const a = await hashPassword('abc12345', FAST_ITERATIONS);
    const b = await hashPassword('abc12345', FAST_ITERATIONS);
    expect(a.passwordSalt).not.toBe(b.passwordSalt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });

  it('存储三元组不含明文密码', async () => {
    const stored = await hashPassword('MySecret123', FAST_ITERATIONS);
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain('MySecret123');
  });

  it('摘要长度固定为 64 字节（hex 128 字符）', async () => {
    const stored = await hashPassword('abc12345', FAST_ITERATIONS);
    expect(stored.passwordHash).toHaveLength(128);
    expect(stored.passwordIterations).toBe(FAST_ITERATIONS);
  });

  it('默认迭代次数不低于 21 万', () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(210_000);
  });

  it('强度校验拒绝弱密码', () => {
    expect(() => assertPasswordStrength('short1')).toThrow();
    expect(() => assertPasswordStrength('onlyletters')).toThrow();
    expect(() => assertPasswordStrength('12345678')).toThrow();
    expect(() => assertPasswordStrength('abc12345')).not.toThrow();
  });
});
