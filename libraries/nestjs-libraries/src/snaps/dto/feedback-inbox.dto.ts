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
  @IsIn(snapsTargetPlatforms)
  platform: SnapsTargetPlatform;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class SnapsFeedbackImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SnapsFeedbackInputDto)
  items: SnapsFeedbackInputDto[];
}

export class SnapsFeedbackPostCommentSourceDto {
  @IsString()
  @MinLength(1)
  postId: string;

  @IsOptional()
  @IsIn(snapsTargetPlatforms)
  platform?: SnapsTargetPlatform;

  @IsOptional()
  @IsString()
  sourceUrl?: string;
}

export class SnapsFeedbackImportPostCommentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SnapsFeedbackPostCommentSourceDto)
  sources: SnapsFeedbackPostCommentSourceDto[];

  @IsOptional()
  @IsIn(snapsTargetPlatforms)
  defaultPlatform?: SnapsTargetPlatform;
}

export class SnapsFeedbackReplyDraftDto {
  @IsString()
  @MinLength(1)
  postId: string;

  @IsString()
  @MinLength(1)
  reply: string;
}

export class SnapsFeedbackPublishReplyDto {
  @IsString()
  @MinLength(1)
  integrationId: string;

  @IsString()
  @MinLength(1)
  platformPostId: string;

  @IsOptional()
  @IsString()
  lastCommentId?: string;

  @IsString()
  @MinLength(1)
  reply: string;

  @IsOptional()
  settings?: Record<string, unknown>;
}

export class SnapsFeedbackSummaryRequestDto {
  @IsOptional()
  @IsIn(snapsTargetPlatforms)
  platform?: SnapsTargetPlatform;

  @IsOptional()
  @IsIn(snapsFeedbackSentimentInputs)
  sentiment?: SnapsFeedbackSentiment | 'positive' | 'negative';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SnapsFeedbackInputDto)
  items?: SnapsFeedbackInputDto[];
}
