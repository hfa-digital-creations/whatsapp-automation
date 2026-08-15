import { IsOptional, IsString } from 'class-validator';

export class ActivateClientDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
