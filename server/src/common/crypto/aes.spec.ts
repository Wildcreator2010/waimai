import { maskSecret, open, seal } from './aes';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('MemberToken 加解密（AES-256-GCM）', () => {
  it('往返解密得到原文', () => {
    const box = seal('token-value-123456', KEY);
    expect(open(box, KEY)).toBe('token-value-123456');
  });

  it('每次加密的 IV 不同，密文也不同', () => {
    const a = seal('same-token-value', KEY);
    const b = seal('same-token-value', KEY);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('密文被篡改时解密抛错', () => {
    const box = seal('token-value-123456', KEY);
    const tampered = { ...box, ciphertext: Buffer.from('hacked').toString('base64') };
    expect(() => open(tampered, KEY)).toThrow();
  });

  it('密钥不对时解密抛错', () => {
    const box = seal('token-value-123456', KEY);
    const otherKey = Buffer.alloc(32, 9).toString('base64');
    expect(() => open(box, otherKey)).toThrow();
  });

  it('密钥长度不是 32 字节时直接拒绝', () => {
    expect(() => seal('x', Buffer.alloc(16, 1).toString('base64'))).toThrow();
  });

  it('掩码保留首 6 尾 4，短值全遮蔽', () => {
    expect(maskSecret('abcdefghijklmnop')).toBe('abcdef…mnop');
    expect(maskSecret('short')).toBe('*****');
  });
});
