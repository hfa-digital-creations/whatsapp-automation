import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class OfferGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.offerGroup.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }

  async getById(id: string) {
    const group = await this.prisma.offerGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: { client: { select: { id: true, businessName: true, user: { select: { email: true } } } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found.');
    return group;
  }

  create(name: string) {
    return this.prisma.offerGroup.create({ data: { name } });
  }

  async rename(id: string, name: string) {
    await this.getById(id);
    return this.prisma.offerGroup.update({ where: { id }, data: { name } });
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.offerGroup.delete({ where: { id } });
    return { deleted: true };
  }

  async addClientMember(groupId: string, clientId: string) {
    await this.getById(groupId);
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');
    const existing = await this.prisma.offerGroupMember.findFirst({ where: { groupId, clientId } });
    if (existing) throw new BadRequestException('This client is already in the group.');
    return this.prisma.offerGroupMember.create({ data: { groupId, clientId } });
  }

  async addPhoneMember(groupId: string, phone: string, name?: string) {
    await this.getById(groupId);
    const trimmed = phone.trim();
    if (!trimmed) throw new BadRequestException('Phone number is required.');
    const existing = await this.prisma.offerGroupMember.findFirst({ where: { groupId, phone: trimmed, clientId: null } });
    if (existing) throw new BadRequestException('This phone number is already in the group.');
    return this.prisma.offerGroupMember.create({ data: { groupId, phone: trimmed, name: name?.trim() || undefined } });
  }

  async removeMember(groupId: string, memberId: string) {
    const member = await this.prisma.offerGroupMember.findFirst({ where: { id: memberId, groupId } });
    if (!member) throw new NotFoundException('Member not found in this group.');
    await this.prisma.offerGroupMember.delete({ where: { id: memberId } });
    return { removed: true };
  }
}
