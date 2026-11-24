import {
  IsArray,
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

export const snapsFeedbackSentiments = [
  'question',
  'praise',
  'complaint',
  'spam',
  'collaboration',
  'other',
] as const;

export type SnapsFeedbackSentiment = (typeof snapsFeedbackSentiments)[number];

export const snapsFeedbackSentimentInputs = [
  ...snapsFeedbackSentiments,
  'positive',
  'negative',
] as const;

export class SnapsFeedbackInputDto {
  @IsIn(snapsTargetPlatforms, { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  platform: SnapsTargetPlatform;

  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(1, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  content: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  postId?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  author?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  sourceUrl?: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  createdAt?: string;
}

export class SnapsFeedbackImportDto {
  @IsArray({ message: '$property은(는) 배열이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => SnapsFeedbackInputDto)
  items: SnapsFeedbackInputDto[];
}

export class SnapsFeedbackPostCommentSourceDto {
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(1, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  postId: string;

  @IsOptional()
  @IsIn(snapsTargetPlatforms, { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  platform?: SnapsTargetPlatform;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  sourceUrl?: string;
}

export class SnapsFeedbackImportPostCommentsDto {
  @IsArray({ message: '$property은(는) 배열이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => SnapsFeedbackPostCommentSourceDto)
  sources: SnapsFeedbackPostCommentSourceDto[];

  @IsOptional()
  @IsIn(snapsTargetPlatforms, { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  defaultPlatform?: SnapsTargetPlatform;
}

export class SnapsFeedbackReplyDraftDto {
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(1, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  postId: string;

  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(1, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  reply: string;
}

export class SnapsFeedbackPublishReplyDto {
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(1, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  integrationId: string;

  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(1, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  platformPostId: string;

  @IsOptional()
  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  lastCommentId?: string;

  @IsString({ message: '$property은(는) 문자열이어야 합니다.' })
  @MinLength(1, { message: '$property은(는) 최소 $constraint1자 이상이어야 합니다.' })
  reply: string;

  @IsOptional()
  settings?: Record<string, unknown>;

  /**
   * Publishing a reply posts to a connected channel immediately and cannot be
   * undone, so the caller has to say the operator confirmed it. Draft and
   * scheduled post creation already require this; the route that actually
   * reaches the platform did not.
   */
  @IsOptional()
  operatorConfirmed?: boolean;
}

export class SnapsFeedbackSummaryRequestDto {
  @IsOptional()
  @IsIn(snapsTargetPlatforms, { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  platform?: SnapsTargetPlatform;

  @IsOptional()
  @IsIn(snapsFeedbackSentimentInputs, { message: '$property에 지원하지 않는 값이 있습니다. 가능한 값: $constraint1' })
  sentiment?: SnapsFeedbackSentiment | 'positive' | 'negative';

  @IsOptional()
  @IsArray({ message: '$property은(는) 배열이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => SnapsFeedbackInputDto)
  items?: SnapsFeedbackInputDto[];
}
