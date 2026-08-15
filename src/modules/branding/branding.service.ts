import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { UpsertBrandingDto } from './dto/upsert-branding.dto';

const DEFAULT_BRANDING = {
  logoUrl: null,
  primaryColor: '#F97316',
  secondaryColor: '#FFFFFF',
  accentColor: '#1F2937',
  theme: 'light',
  loginBranding: null,
};

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async getForClient(clientId: string) {
    const branding = await this.prisma.clientBranding.findUnique({ where: { clientId } });
    return branding ?? { clientId, ...DEFAULT_BRANDING };
  }

  async upsert(clientId: string, dto: UpsertBrandingDto) {
    return this.prisma.clientBranding.upsert({
      where: { clientId },
      update: dto as any,
      create: { clientId, ...dto } as any,
    });
  }
}
