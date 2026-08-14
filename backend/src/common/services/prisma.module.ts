import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PasswordService } from './password.service';

@Global()
@Module({
  providers: [PrismaService, PasswordService],
  exports: [PrismaService, PasswordService],
})
export class PrismaModule {}
