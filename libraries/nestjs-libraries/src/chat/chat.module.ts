import { Global, Module } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { SnapsModule } from '@gitroom/nestjs-libraries/snaps/snaps.module';

@Global()
@Module({
  imports: [SnapsModule],
  providers: [MastraService, LoadToolsService, ...toolList],
  get exports() {
    return this.providers;
  },
})
export class ChatModule {}
