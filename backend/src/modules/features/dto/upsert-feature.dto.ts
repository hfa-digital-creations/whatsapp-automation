import { IsOptional, IsString } from 'class-validator';

export class UpsertFeatureDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
