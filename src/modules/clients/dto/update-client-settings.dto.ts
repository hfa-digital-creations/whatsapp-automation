import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { AutomationMode } from '@prisma/client';

export class UpdateClientSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  businessName?: string;

  @IsOptional()
  @IsString()
  fallbackMessage?: string;

  @IsOptional()
  @IsUrl()
  defaultPaymentLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  conversationFlow?: string;

  @IsOptional()
  @IsEnum(AutomationMode)
  automationMode?: AutomationMode;
}
