import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertBrandingDto {
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsObject()
  loginBranding?: Record<string, unknown>;
}
