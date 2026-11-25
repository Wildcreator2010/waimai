import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaService } from '../prisma/prisma.service';
import { randomSetupCode } from '../common/crypto/tokens';

/**
 * 一次性引导码。
 * 首次部署时生成，写在容器日志与 data/bootstrap-code.txt；
 * 创建 ROOT 成功后引导入口永久关闭（由 ROOT 是否已存在决定）。
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger('Bootstrap');
  private setupCode = '';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const rootExists = await this.hasRoot();
    if (rootExists) {
      this.logger.log('已存在 ROOT 账号，引导入口关闭');
      return;
    }
    const fromEnv = this.config.get<string>('BOOTSTRAP_SETUP_CODE', '');
    if (fromEnv) {
      this.setupCode = fromEnv;
    } else {
      // 复用上次落盘的码：否则每次重启都会换一个，用户拿到的码就失效了
      const persisted = this.readPersisted();
      this.setupCode = persisted || randomSetupCode();
      if (!persisted) this.persist(this.setupCode);
    }
    this.logger.warn('==================================================');
    this.logger.warn(`首次部署引导码：${this.setupCode}`);
    this.logger.warn('打开 Web 的 /setup 页面输入该码创建 ROOT，创建后入口永久关闭');
    this.logger.warn('==================================================');
  }

  async hasRoot(): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { role: Role.ROOT } });
    return count > 0;
  }

  /** 恒定比较，防时序侧信道；引导码本身是一次性的，这里只是不额外泄露。 */
  verify(code: string): boolean {
    if (!this.setupCode) return false;
    const a = Buffer.from(String(code ?? '').trim().toUpperCase(), 'utf8');
    const b = Buffer.from(this.setupCode.toUpperCase(), 'utf8');
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /** ROOT 创建成功后清空内存里的码，避免被重复使用。 */
  invalidate(): void {
    this.setupCode = '';
  }

  private persist(code: string): void {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'bootstrap-code.txt'), `${code}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      this.logger.warn(`引导码落盘失败（不影响使用）：${(error as Error).message}`);
    }
  }

  private readPersisted(): string {
    try {
      const file = join(process.cwd(), 'data', 'bootstrap-code.txt');
      if (!existsSync(file)) return '';
      return readFileSync(file, 'utf8').trim();
    } catch {
      return '';
    }
  }
}
