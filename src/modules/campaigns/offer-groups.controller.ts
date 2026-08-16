import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { OfferGroupsService } from './offer-groups.service';
import { UpsertOfferGroupDto, AddGroupMemberDto } from './dto/offer-group.dto';

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
}
