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
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(5, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  sourceText: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  title?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  sourcePlatform?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  topic?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  tone?: string;

  @IsOptional()
  @IsArray({ message: '$property은(는) 배열이어야 합니다.' })
  tags?: string[];
}

export class SnapsPromoteSourceToRagDto {
  @IsIn(snapsTargetPlatforms, { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  platform: SnapsTargetPlatform;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  authorType?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  topic?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  tone?: string;
}
