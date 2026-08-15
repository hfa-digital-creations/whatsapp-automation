import { IsEnum, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { AutomationMode } from '@prisma/client';

// ValidateIf(value !== undefined) instead of @IsOptional() deliberately: @IsOptional() treats
// an explicit `null` the same as "field omitted" and skips validation entirely, which let a
// `null` slip past validation and crash with a raw Prisma error on these non-nullable columns
// (found via manual testing). ValidateIf still allows omitting the field, but a value that IS
// sent — including null — has to pass the real validator, producing a clean 400 instead.
export class UpdateClientSettingsDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  businessName?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  fallbackMessage?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsUrl()
  defaultPaymentLink?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(4000)
  conversationFlow?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(AutomationMode)
  automationMode?: AutomationMode;
}
