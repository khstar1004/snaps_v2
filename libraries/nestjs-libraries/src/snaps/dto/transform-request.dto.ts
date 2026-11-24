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
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(5, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  sourceText: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  sourcePlatform?: string;

  @IsOptional()
  @IsArray({ message: '$property은(는) 배열이어야 합니다.' })
  @IsIn(snapsTargetPlatforms, { each: true, message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  targetPlatforms?: SnapsTargetPlatform[];

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  tone?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  topic?: string;

  @IsOptional()
  @IsBoolean({ message: '$property은(는) true 또는 false여야 합니다.' })
  useRag?: boolean;
}

export class SnapsStyleExampleDto {
  @IsIn(snapsTargetPlatforms, { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  platform: SnapsTargetPlatform;

  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(5, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  content: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  authorType?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  topic?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  tone?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  sourceUrl?: string;

  @IsOptional()
  metrics?: Record<string, unknown>;
}

export class SnapsScheduleIntegrationDto {
  @IsIn(snapsTargetPlatforms, { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  platform: SnapsTargetPlatform;

  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  integrationId: string;
}

export class SnapsTransformAndScheduleRequestDto extends SnapsTransformRequestDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: '$property은(는) ISO 8601 날짜 문자열이어야 합니다.' }
  )
  publishDate?: string;

  @IsOptional()
  @IsIn(['draft', 'schedule'], { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  scheduleType?: 'draft' | 'schedule';

  @IsOptional()
  @IsBoolean({ message: '$property은(는) true 또는 false여야 합니다.' })
  operatorConfirmed?: boolean;

  @IsArray({ message: '$property은(는) 배열이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => SnapsScheduleIntegrationDto)
  integrations: SnapsScheduleIntegrationDto[];
}

export class SnapsScheduleVariantsRequestDto {
  @IsArray({ message: '$property은(는) 배열이어야 합니다.' })
  variants: SnapsVariant[];

  @IsOptional()
  @IsDateString(
    {},
    { message: '$property은(는) ISO 8601 날짜 문자열이어야 합니다.' }
  )
  publishDate?: string;

  @IsOptional()
  @IsIn(['draft', 'schedule'], { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  scheduleType?: 'draft' | 'schedule';

  @IsOptional()
  @IsBoolean({ message: '$property은(는) true 또는 false여야 합니다.' })
  operatorConfirmed?: boolean;

  @IsArray({ message: '$property은(는) 배열이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => SnapsScheduleIntegrationDto)
  integrations: SnapsScheduleIntegrationDto[];
}
