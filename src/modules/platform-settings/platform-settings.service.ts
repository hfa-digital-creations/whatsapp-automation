import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/services/prisma.service';

const FAVICON_RULES: Record<string, { maxBytes: number }> = {
  ico: { maxBytes: 1 * 1024 * 1024 },
  png: { maxBytes: 1 * 1024 * 1024 },
};

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get uploadRoot(): string {
    return this.config.get<string>('UPLOAD_PATH') ?? path.join(process.cwd(), 'uploads');
  }

  /** Singleton row, created lazily on first read/write — there is never more than one. */
  async get() {
    const existing = await this.prisma.platformSettings.findFirst();
    if (existing) return existing;
    return this.prisma.platformSettings.create({ data: {} });
  }

  async uploadFavicon(file: Express.Multer.File) {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const rule = FAVICON_RULES[ext];
    if (!rule) throw new BadRequestException('Unsupported file type. Allowed: .ico or .png.');
    if (file.size > rule.maxBytes) throw new BadRequestException('Favicon must be under 1MB.');

    const dir = path.join(this.uploadRoot, 'platform');
    fs.mkdirSync(dir, { recursive: true });
    // Clear any previously stored favicon first — it may have had a different extension,
    // and leaving it behind would just be an orphaned file nobody links to anymore.
    for (const existingExt of Object.keys(FAVICON_RULES)) {
      fs.rmSync(path.join(dir, `favicon.${existingExt}`), { force: true });
    }
    const storedFileName = `favicon.${ext}`;
    fs.writeFileSync(path.join(dir, storedFileName), file.buffer);

    const settings = await this.get();
    return this.prisma.platformSettings.update({
      where: { id: settings.id },
      data: { faviconUrl: `/api/uploads/platform/${storedFileName}` },
    });
  }

  async updateDigestTime(dailyDigestTime: string) {
    const settings = await this.get();
    return this.prisma.platformSettings.update({ where: { id: settings.id }, data: { dailyDigestTime } });
  }
}
