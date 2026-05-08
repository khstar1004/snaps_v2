import { Module } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsReportGeneratorService } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';

@Module({
  providers: [
    OllamaClient,
    SnapsContentTransformService,
    SnapsVectorStoreService,
    SnapsRagService,
    SnapsReportGeneratorService,
    SnapsShortVideoService,
    SnapsFeedbackInboxService,
    SnapsSourceLibraryService,
    SnapsActivityLogService,
  ],
  exports: [
    OllamaClient,
    SnapsContentTransformService,
    SnapsVectorStoreService,
    SnapsRagService,
    SnapsReportGeneratorService,
    SnapsShortVideoService,
    SnapsFeedbackInboxService,
    SnapsSourceLibraryService,
    SnapsActivityLogService,
  ],
})
export class SnapsModule {}
