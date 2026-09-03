import { IsBoolean } from 'class-validator';

export class SetContactAutomationDto {
  @IsBoolean()
  enabled: boolean;
}
