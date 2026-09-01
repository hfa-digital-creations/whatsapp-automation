import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { AutomationMode } from '@prisma/client';

/** Both fields optional — the admin panel can flip the enable/disable switch without
 * resending the current mode, and vice versa; whichever is provided gets updated. */
export class UpdateEnquiryAutomationModeDto {
  @IsOptional()
  @IsEnum(AutomationMode)
  enquiryAutomationMode?: AutomationMode;

  @IsOptional()
  @IsBoolean()
  adminAutoReplyEnabled?: boolean;
}
