import { IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateOfferTextDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  prompt: string;
}
