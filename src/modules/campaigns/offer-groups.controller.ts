import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { buildCsv, buildVcf } from '../../common/utils/contact-export.util';
import { OfferGroupsService } from './offer-groups.service';
import { UpsertOfferGroupDto, AddGroupMemberDto } from './dto/offer-group.dto';

const MAX_VCF_BYTES = 5 * 1024 * 1024;

@Controller('admin/offer-groups')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class OfferGroupsController {
  constructor(private readonly offerGroupsService: OfferGroupsService) {}

  @Get()
  list() {
    return this.offerGroupsService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.offerGroupsService.getById(id);
  }

  @Post()
  create(@Body() dto: UpsertOfferGroupDto) {
    return this.offerGroupsService.create(dto.name);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() dto: UpsertOfferGroupDto) {
    return this.offerGroupsService.rename(id, dto.name);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.offerGroupsService.delete(id);
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() dto: AddGroupMemberDto) {
    if (dto.clientId) return this.offerGroupsService.addClientMember(id, dto.clientId);
    if (dto.phone) return this.offerGroupsService.addPhoneMember(id, dto.phone, dto.name);
    throw new BadRequestException('Provide either clientId or phone.');
  }

  @Delete(':id/members/:memberId')
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.offerGroupsService.removeMember(id, memberId);
  }

  /** Exports the group's members (client and manual phone members alike) as a downloadable .vcf or .csv file. */
  @Get(':id/export')
  @RawResponse()
  async export(@Param('id') id: string, @Query('format') format: string | undefined, @Res() res: Response) {
    if (format !== 'vcf' && format !== 'csv') {
      throw new BadRequestException('format must be "vcf" or "csv".');
    }
    const contacts = await this.offerGroupsService.exportContacts(id);
    const content = format === 'csv' ? buildCsv(contacts) : buildVcf(contacts);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="group-contacts-export.${format}"`);
    res.send(content);
  }

  /** Bulk-adds contacts from an uploaded .vcf (vCard) export — e.g. from Google/Apple/Outlook contacts. */
  @Post(':id/members/import-vcf')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_VCF_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!/\.vcf$/i.test(file.originalname)) {
          return callback(new BadRequestException('Please upload a .vcf (vCard) file.'), false);
        }
        callback(null, true);
      },
    }),
  )
  importVcf(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.offerGroupsService.importVcf(id, file);
  }
}
