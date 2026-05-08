import { IsDefined, IsOptional, IsString, MinLength } from 'class-validator';

export class NaverCafeDto {
  @IsString()
  @MinLength(1)
  @IsDefined()
  clubId: string;

  @IsString()
  @MinLength(1)
  @IsDefined()
  menuId: string;

  @IsString()
  @MinLength(2)
  @IsDefined()
  subject: string;

  @IsOptional()
  @IsString()
  category?: string;
}
