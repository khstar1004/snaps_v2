import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';
import { GeneratorDto } from '@gitroom/nestjs-libraries/dtos/generator/generator.dto';

@Injectable()
export class AgentRun {
  constructor(private _agentGraphService: AgentGraphService) {}
  @Command({
    command: 'run:agent',
    describe: 'Run the agent',
  })
  async agentRun() {
    const orgId = process.env.SNAPS_AGENT_ORG_ID;
    if (!orgId) {
      throw new Error('SNAPS_AGENT_ORG_ID is required to run the agent task.');
    }

    const request: GeneratorDto = {
      research:
        process.env.SNAPS_AGENT_RESEARCH ??
        'Create a short snaps social post about Korean AI content operations.',
      isPicture: process.env.SNAPS_AGENT_IS_PICTURE === 'true',
      format: 'one_short',
      tone: 'company',
    };

    const stream = this._agentGraphService.start(orgId, request) as AsyncIterable<unknown>;
    for await (const event of stream) {
      console.log(JSON.stringify(event));
    }
  }
}
