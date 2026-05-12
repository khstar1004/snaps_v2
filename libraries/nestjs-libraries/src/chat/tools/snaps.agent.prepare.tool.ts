import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { SnapsCommandPlannerService } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';

@Injectable()
export class SnapsAgentPrepareTool implements AgentToolInterface {
  constructor(private readonly _planner: SnapsCommandPlannerService) {}

  name = 'snapsAgentPrepareTool';

  run() {
    return createTool({
      id: 'snapsAgentPrepareTool',
      mcp: {
        annotations: {
          title: 'Prepare Snaps Agent Plan',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      description: `
Use this tool first for high-level publishing commands such as:
"Tomorrow at 10, write an AI post for Instagram, Threads, and LinkedIn, make a funny Short too, and post after confirmation."

It converts the natural-language command into a safe operator plan, platform-specific drafts, optional short-form video script/job, and an AiToEarn-inspired Monetize/Publish/Engage/Create operating map.
It never publishes or schedules by itself. After this tool returns, show the preview and ask for explicit confirmation before using schedulePostTool or manualPosting.
`,
      inputSchema: z.object({
        command: z.string().min(5),
        useRag: z.boolean().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organization = JSON.parse(
          ((context?.requestContext as any)?.get('organization') as string) || '{}'
        );
        if (!organization.id) {
          return {
            error: 'Organization context is required.',
          };
        }

        return this._planner.prepare(organization.id, {
          command: inputData.command,
          useRag: inputData.useRag,
        });
      },
    });
  }
}
