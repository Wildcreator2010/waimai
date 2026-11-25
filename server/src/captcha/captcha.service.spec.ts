import { CaptchaService } from './captcha.service';

function makeService(provider = 'builtin', secret = '') {
  const config = {
    get: (key: string, fallback: unknown) => {
      if (key === 'CAPTCHA_PROVIDER') return provider;
      if (key === 'TURNSTILE_SECRET') return secret;
      return fallback;
    },
  };
  return new CaptchaService(config as never);
}

describe('人机验证（builtin）', () => {
  it('签发题目后可正确校验', () => {
    const captcha = makeService();
    const issued = captcha.issue('register');
    expect(issued.id).toBeTruthy();
    expect(issued.question).toMatch(/^\d+ [+×] \d+ = \?$/);

    // 从题目里算出答案
    const match = /^(\d+) ([+×]) (\d+) = \?$/.exec(issued.question);
    const a = Number(match![1]);
    const b = Number(match![3]);
    const answer = match![2] === '+' ? a + b : a * b;

    expect(captcha.verify(issued.id, String(answer), 'register')).toBe(true);
  });

  it('挑战一次性：同一 id 第二次必失败', () => {
    const captcha = makeService();
    const issued = captcha.issue('register');
    const match = /^(\d+) ([+×]) (\d+) = \?$/.exec(issued.question);
    const answer = String(
      match![2] === '+' ? Number(match![1]) + Number(match![3]) : Number(match![1]) * Number(match![3]),
    );

    expect(captcha.verify(issued.id, answer, 'register')).toBe(true);
    expect(captcha.verify(issued.id, answer, 'register')).toBe(false);
  });

  it('答案错误也消费掉挑战（不能反复猜）', () => {
    const captcha = makeService();
    const issued = captcha.issue('phone');
    expect(captcha.verify(issued.id, '999999', 'phone')).toBe(false);
    expect(captcha.verify(issued.id, '999999', 'phone')).toBe(false);
  });

  it('用途不匹配时拒绝（防止跨场景复用）', () => {
    const captcha = makeService();
    const issued = captcha.issue('register');
    const match = /^(\d+) ([+×]) (\d+) = \?$/.exec(issued.question);
    const answer = String(
      match![2] === '+' ? Number(match![1]) + Number(match![3]) : Number(match![1]) * Number(match![3]),
    );
    expect(captcha.verify(issued.id, answer, 'phone')).toBe(false);
  });

  it('空 id / 空答案直接失败', () => {
    const captcha = makeService();
    expect(captcha.verify('', '1', 'register')).toBe(false);
    expect(captcha.verify('x', '', 'register')).toBe(false);
  });

  it('provider=off 时一律放行（仅调试用）', () => {
    const captcha = makeService('off');
    expect(captcha.verify('', '', 'register')).toBe(true);
  });

  it('provider=turnstile 但缺 secret 时回退 builtin', () => {
    const captcha = makeService('turnstile', '');
    expect(captcha.activeProvider).toBe('builtin');
  });

  it('turnstile provider 下 builtin 校验不生效', () => {
    const captcha = makeService('turnstile', 'secret');
    expect(captcha.activeProvider).toBe('turnstile');
    expect(captcha.verify('any', '1', 'register')).toBe(false);
  });
});
