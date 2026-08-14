import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { QuotationsService } from './quotations.service';
import { UpsertQuotationTemplateDto } from './dto/upsert-template.dto';
import { GenerateQuotationDto } from './dto/generate-quotation.dto';

@Controller('client/quotations')
@Roles(UserRole.CLIENT)
@UseGuards(FeatureGuard)
@RequireFeature('AUTO_QUOTATION')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.quotationsService.listTemplates(user.clientId!);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertQuotationTemplateDto) {
    return this.quotationsService.createTemplate(user.clientId!, dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Partial<UpsertQuotationTemplateDto>,
  ) {
    return this.quotationsService.updateTemplate(user.clientId!, id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quotationsService.deleteTemplate(user.clientId!, id);
  }

  @Get()
  listQuotations(@CurrentUser() user: AuthenticatedUser) {
    return this.quotationsService.listQuotations(user.clientId!);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateQuotationDto) {
    return this.quotationsService.generate(user.clientId!, dto);
  }
}
