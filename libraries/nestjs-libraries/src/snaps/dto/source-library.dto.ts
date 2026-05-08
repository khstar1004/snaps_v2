import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export class SnapsSourceLibraryInputDto {
  @IsString()
  @MinLength(5)
  sourceText: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  sourcePlatform?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class SnapsPromoteSourceToRagDto {
  @IsIn(snapsTargetPlatforms)
  platform: SnapsTargetPlatform;

  @IsOptional()
  @IsString()
  authorType?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  tone?: string;
}
