import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { buildCsv, buildVcf } from '../../common/utils/contact-export.util';
import { OfferGroupsService } from './offer-groups.service';
import { UpsertOfferGroupDto, AddGroupMemberDto } from './dto/offer-group.dto';

const MAX_VCF_BYTES = 5 * 1024 * 1024;

/** A client's own contact groups — their own customers, never other platform tenants. Mirrors
 * OfferGroupsController but every call is scoped to the caller's own clientId (spec §28). */
@Controller('client/offer-groups')
@Roles(UserRole.CLIENT)
@UseGuards(FeatureGuard)
@RequireFeature('OFFER_MESSAGES')
export class ClientOfferGroupsController {
  constructor(private readonly offerGroupsService: OfferGroupsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.offerGroupsService.list(user.clientId!);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offerGroupsService.getById(id, user.clientId!);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertOfferGroupDto) {
    return this.offerGroupsService.create(dto.name, user.clientId!);
  }

  @Patch(':id')
  rename(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertOfferGroupDto) {
    return this.offerGroupsService.rename(id, dto.name, user.clientId!);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offerGroupsService.delete(id, user.clientId!);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AddGroupMemberDto) {
    if (!dto.phone) throw new BadRequestException('Provide a phone number.');
    return this.offerGroupsService.addPhoneMember(id, dto.phone, dto.name, user.clientId!);
  }

  @Delete(':id/members/:memberId')
  removeMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.offerGroupsService.removeMember(id, memberId, user.clientId!);
  }

  @Get(':id/export')
  @RawResponse()
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    if (format !== 'vcf' && format !== 'csv') {
      throw new BadRequestException('format must be "vcf" or "csv".');
    }
    const contacts = await this.offerGroupsService.exportContacts(id, user.clientId!);
    const content = format === 'csv' ? buildCsv(contacts) : buildVcf(contacts);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="group-contacts-export.${format}"`);
    res.send(content);
  }

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
  importVcf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.offerGroupsService.importVcf(id, file, user.clientId!);
  }
}
