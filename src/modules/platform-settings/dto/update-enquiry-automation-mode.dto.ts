import { IsEnum } from 'class-validator';
import { AutomationMode } from '@prisma/client';

export class UpdateEnquiryAutomationModeDto {
  @IsEnum(AutomationMode)
  enquiryAutomationMode!: AutomationMode;
}
