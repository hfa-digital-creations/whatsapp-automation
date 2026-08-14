import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { DurationType, PlanStatus } from '@prisma/client';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  fullDescription?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsInt()
  @Min(1)
  durationValue: number;

  @IsEnum(DurationType)
  durationType: DurationType;

  @IsInt()
  @Min(1)
  whatsappAccountLimit: number;

  @IsNumber()
  @Min(0)
  additionalAccountPrice: number;

  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  featureCodes?: string[];
}
