import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;
}
