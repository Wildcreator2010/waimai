import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const AAD = Buffer.from('locker-credential-v1', 'utf8');

export interface SealedBox {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function keyFromBase64(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('MEMBER_TOKEN_ENC_KEY 必须是 32 字节的 base64');
  }
  return key;
}

/** AES-256-GCM：认证加密，密文被篡改会在解密时抛错。 */
export function seal(plaintext: string, keyBase64: string): SealedBox {
  const key = keyFromBase64(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function open(box: SealedBox, keyBase64: string): string {
  const key = keyFromBase64(keyBase64);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(box.iv, 'base64'));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(box.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(box.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** 展示用掩码：前 6 后 4，中间省略。 */
export function maskSecret(value: string): string {
  const text = String(value ?? '');
  if (text.length <= 12) return '*'.repeat(text.length);
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}
