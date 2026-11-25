import { Module } from '@nestjs/common';

import { CredentialService } from './credential.service';
import { LockerClient } from './locker.client';
import { MemberTokenController } from './member-token.controller';

@Module({
  controllers: [MemberTokenController],
  providers: [LockerClient, CredentialService],
  exports: [LockerClient, CredentialService],
})
export class LockerModule {}
