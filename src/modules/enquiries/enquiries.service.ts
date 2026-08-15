import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnquiryStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EnquiryAutomationService } from './enquiry-automation.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';

@Injectable()
export class EnquiriesService {
  private readonly logger = new Logger(EnquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly enquiryAutomation: EnquiryAutomationService,
  ) {}

  async create(dto: CreateEnquiryDto) {
    const enquiry = await this.prisma.enquiry.create({ data: dto });

    const admins = await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } } });
    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.notifyInApp(
          admin.id,
          'NEW_ENQUIRY',
          'New enquiry received',
          `${dto.name} (${dto.phone}) submitted an enquiry.`,
        ),
      ),
    );

    // Fire-and-forget: the public enquiry form must not wait on an AI call + WhatsApp/email
    // send before it gets a response, and a slow/failed outreach should never fail the
    // enquiry submission itself.
    this.enquiryAutomation
      .sendInitialOutreach(enquiry)
      .catch((err) => this.logger.warn(`Automatic outreach failed for enquiry ${enquiry.id}: ${err.message}`));

    return enquiry;
  }

  list(params: { status?: EnquiryStatus; skip?: number; take?: number }) {
    const { status, skip = 0, take = 50 } = params;
    return this.prisma.enquiry.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, skip, take });
  }

  getMessages(id: string) {
    return this.enquiryAutomation.getMessages(id);
  }

  async updateStatus(id: string, status: EnquiryStatus) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException('Enquiry not found.');
    const updated = await this.prisma.enquiry.update({ where: { id }, data: { status } });

    if (status === EnquiryStatus.CONVERTED && enquiry.status !== EnquiryStatus.CONVERTED) {
      this.enquiryAutomation
        .notifyAdminOfConversion(updated)
        .catch((err) => this.logger.warn(`Conversion notification failed for enquiry ${id}: ${err.message}`));
    }

    return updated;
  }
}
