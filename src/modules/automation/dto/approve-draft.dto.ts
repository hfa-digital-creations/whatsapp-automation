import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  editedContent?: string;
}
