import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertOfferGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;
}

export class AddGroupMemberDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;
}
