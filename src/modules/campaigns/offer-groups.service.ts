import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { parseVcf } from './vcf-parser';
import { ExportContact } from '../../common/utils/contact-export.util';

@Injectable()
export class OfferGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `ownerClientId` is null for the admin's own groups (spec default, unchanged) or a
   * client's id for their own private contact groups — always passed explicitly. */
  list(ownerClientId: string | null = null) {
    return this.prisma.offerGroup.findMany({
      where: { ownerClientId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }

  /** A mismatched `ownerClientId` is reported as "not found", not "forbidden", so a client
   * can never learn another tenant's group exists. */
  async getById(id: string, ownerClientId: string | null = null) {
    const group = await this.prisma.offerGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            client: { select: { id: true, businessName: true, user: { select: { email: true, phone: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group || group.ownerClientId !== ownerClientId) throw new NotFoundException('Group not found.');
    return group;
  }

  create(name: string, ownerClientId: string | null = null) {
    return this.prisma.offerGroup.create({ data: { name, ownerClientId } });
  }

  async rename(id: string, name: string, ownerClientId: string | null = null) {
    await this.getById(id, ownerClientId);
    return this.prisma.offerGroup.update({ where: { id }, data: { name } });
  }

  async delete(id: string, ownerClientId: string | null = null) {
    await this.getById(id, ownerClientId);
    await this.prisma.offerGroup.delete({ where: { id } });
    return { deleted: true };
  }

  /** Adding a registered platform client as a member only makes sense for the admin's own
   * groups — a client's audience is their own customers, never other platform tenants. */
  async addClientMember(groupId: string, clientId: string, ownerClientId: string | null = null) {
    if (ownerClientId) throw new BadRequestException('Cannot add a platform client to your own contact group.');
    await this.getById(groupId, ownerClientId);
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found.');
    const existing = await this.prisma.offerGroupMember.findFirst({ where: { groupId, clientId } });
    if (existing) throw new BadRequestException('This client is already in the group.');
    return this.prisma.offerGroupMember.create({ data: { groupId, clientId } });
  }

  async addPhoneMember(groupId: string, phone: string, name: string | undefined, ownerClientId: string | null = null) {
    await this.getById(groupId, ownerClientId);
    const trimmed = phone.trim();
    if (!trimmed) throw new BadRequestException('Phone number is required.');
    const existing = await this.prisma.offerGroupMember.findFirst({ where: { groupId, phone: trimmed, clientId: null } });
    if (existing) throw new BadRequestException('This phone number is already in the group.');
    return this.prisma.offerGroupMember.create({ data: { groupId, phone: trimmed, name: name?.trim() || undefined } });
  }

  async removeMember(groupId: string, memberId: string, ownerClientId: string | null = null) {
    await this.getById(groupId, ownerClientId);
    const member = await this.prisma.offerGroupMember.findFirst({ where: { id: memberId, groupId } });
    if (!member) throw new NotFoundException('Member not found in this group.');
    await this.prisma.offerGroupMember.delete({ where: { id: memberId } });
    return { removed: true };
  }

  async exportContacts(groupId: string, ownerClientId: string | null = null): Promise<ExportContact[]> {
    const group = await this.getById(groupId, ownerClientId);
    return group.members.map((m) =>
      m.client
        ? { name: m.client.businessName, phone: m.client.user.phone, email: m.client.user.email }
        : { name: m.name ?? m.phone ?? 'Unknown', phone: m.phone, email: undefined },
    );
  }

  /** Bulk-adds every contact with a phone number found in an uploaded .vcf file, skipping ones already in the group. */
  async importVcf(groupId: string, file: Express.Multer.File, ownerClientId: string | null = null) {
    await this.getById(groupId, ownerClientId);
    const contacts = parseVcf(file.buffer.toString('utf8'));
    if (!contacts.length) {
      throw new BadRequestException('No contacts with a phone number were found in that file.');
    }

    const existingMembers = await this.prisma.offerGroupMember.findMany({
      where: { groupId, clientId: null },
      select: { phone: true },
    });
    const existingPhones = new Set(existingMembers.map((m) => m.phone));

    let imported = 0;
    let skipped = 0;
    for (const contact of contacts) {
      if (existingPhones.has(contact.phone)) {
        skipped++;
        continue;
      }
      await this.prisma.offerGroupMember.create({
        data: { groupId, phone: contact.phone, name: contact.name },
      });
      existingPhones.add(contact.phone);
      imported++;
    }

    return { imported, skipped, total: contacts.length };
  }
}
