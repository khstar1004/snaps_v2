import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';

export class SnapsTransformRequestDto {
  @IsString()
  @MinLength(5)
  sourceText: string;

  @IsOptional()
  @IsString()
  sourcePlatform?: string;

  @IsOptional()
  @IsArray()
  @IsIn(snapsTargetPlatforms, { each: true })
  targetPlatforms?: SnapsTargetPlatform[];

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsBoolean()
  useRag?: boolean;
}

export class SnapsStyleExampleDto {
  @IsIn(snapsTargetPlatforms)
  platform: SnapsTargetPlatform;

  @IsString()
  @MinLength(5)
  content: string;

  @IsOptional()
  @IsString()
  authorType?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  metrics?: Record<string, unknown>;
}

export class SnapsScheduleIntegrationDto {
  @IsIn(snapsTargetPlatforms)
  platform: SnapsTargetPlatform;

  @IsString()
  integrationId: string;
}

export class SnapsTransformAndScheduleRequestDto extends SnapsTransformRequestDto {
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @IsOptional()
  @IsIn(['draft', 'schedule'])
  scheduleType?: 'draft' | 'schedule';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SnapsScheduleIntegrationDto)
  integrations: SnapsScheduleIntegrationDto[];
}

export class SnapsScheduleVariantsRequestDto {
  @IsArray()
  variants: SnapsVariant[];

  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @IsOptional()
  @IsIn(['draft', 'schedule'])
  scheduleType?: 'draft' | 'schedule';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SnapsScheduleIntegrationDto)
  integrations: SnapsScheduleIntegrationDto[];
}
