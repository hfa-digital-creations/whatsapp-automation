import { Body, Controller, Param, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { EnquiryMessageService } from './enquiry-message.service';

class SendEnquiryMessageDto {
  @IsString()
  @MinLength(1)
  content: string;
}

@Controller('admin/enquiries')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class CampaignsController {
  constructor(private readonly enquiryMessageService: EnquiryMessageService) {}

  @Post(':id/generate-message')
  generate(@Param('id') id: string) {
    return this.enquiryMessageService.generateDraft(id);
  }

  @Post(':id/send-message')
  send(@Param('id') id: string, @Body() dto: SendEnquiryMessageDto) {
    return this.enquiryMessageService.send(id, dto.content);
  }
}
