import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTextTrainingDto {
  @IsString()
  @MaxLength(150)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  content: string;
}
