import { Module } from '@nestjs/common';

import { AdminInvitesController } from './admin-invites.controller';
import { InvitesService } from './invites.service';

@Module({
  controllers: [AdminInvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
