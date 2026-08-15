import { Injectable, NotFoundException } from '@nestjs/common';
import { EnquiryStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';

@Injectable()
export class EnquiriesService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsService: NotificationsService) {}

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

    return enquiry;
  }

  list(params: { status?: EnquiryStatus; skip?: number; take?: number }) {
    const { status, skip = 0, take = 50 } = params;
    return this.prisma.enquiry.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, skip, take });
  }

  async updateStatus(id: string, status: EnquiryStatus) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException('Enquiry not found.');
    return this.prisma.enquiry.update({ where: { id }, data: { status } });
  }
}
