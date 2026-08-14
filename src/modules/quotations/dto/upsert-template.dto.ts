import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertQuotationTemplateDto {
  @IsString()
  service: string;

  @IsNumber()
  @Min(0)
  startingPrice: number;

  @IsOptional()
  @IsString()
  pricingMethod?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredInfo?: string[];

  @IsOptional()
  @IsString()
  templateText?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;
}
