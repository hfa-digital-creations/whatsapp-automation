import { IsObject, IsOptional, IsString } from 'class-validator';

export class GenerateQuotationDto {
  @IsString()
  templateId: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string>;
}
