import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTextTrainingDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  content?: string;
}
