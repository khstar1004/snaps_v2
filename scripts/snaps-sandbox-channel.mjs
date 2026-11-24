import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function readArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key.startsWith('--')) {
      continue;
    }
    args[key.slice(2)] = rest[index + 1] || '';
    index += 1;
  }
  return args;
}

function required(args, key) {
  const value = String(args[key] || '').trim();
  if (!value) {
    throw new Error(`--${key} is required`);
  }
  return value;
}

function sandboxInternalId(smokeId) {
  return `snaps-sandbox-${smokeId}`;
}

async function seed(args) {
  const organizationId = required(args, 'org');
  const smokeId = required(args, 'smoke-id');
  const internalId = sandboxInternalId(smokeId);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) {
    throw new Error(`organization not found: ${organizationId}`);
  }

  const integration = await prisma.integration.upsert({
    where: {
      organizationId_internalId: {
        organizationId,
        internalId,
      },
    },
    create: {
      organizationId,
      internalId,
      rootInternalId: internalId,
      name: `snaps Sandbox ${smokeId}`,
      providerIdentifier: 'snapssandbox',
      type: 'social',
      token: `snaps-sandbox-token-${smokeId}`,
      refreshToken: `snaps-sandbox-refresh-${smokeId}`,
      tokenExpiration: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
      profile: 'snaps-sandbox',
      disabled: false,
      refreshNeeded: false,
      inBetweenSteps: false,
      additionalSettings: '[]',
    },
    update: {
      name: `snaps Sandbox ${smokeId}`,
      providerIdentifier: 'snapssandbox',
      type: 'social',
      token: `snaps-sandbox-token-${smokeId}`,
      refreshToken: `snaps-sandbox-refresh-${smokeId}`,
      tokenExpiration: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
      profile: 'snaps-sandbox',
      disabled: false,
      refreshNeeded: false,
      inBetweenSteps: false,
      additionalSettings: '[]',
      deletedAt: null,
    },
  });

  return {
    integrationId: integration.id,
    internalId: integration.internalId,
    providerIdentifier: integration.providerIdentifier,
  };
}

async function markPost(args) {
  const organizationId = required(args, 'org');
  const postId = required(args, 'post-id');
  const releaseId = required(args, 'release-id');
  const updated = await prisma.post.update({
    where: {
      id: postId,
      organizationId,
    },
    data: {
      releaseId,
      releaseURL: `https://snaps.local/sandbox/posts/${encodeURIComponent(releaseId)}`,
      state: 'PUBLISHED',
    },
    select: {
      id: true,
      releaseId: true,
      releaseURL: true,
      state: true,
    },
  });
  return updated;
}

async function cleanup(args) {
  const organizationId = required(args, 'org');
  const smokeId = required(args, 'smoke-id');
  const integrationId = String(args['integration-id'] || '').trim();
  const now = new Date();
  const postWhere = {
    organizationId,
    OR: [
      ...(integrationId ? [{ integrationId }] : []),
      { content: { contains: smokeId } },
      { releaseId: { contains: smokeId } },
      { releaseURL: { contains: smokeId } },
    ],
  };

  const posts = await prisma.post.findMany({
    where: postWhere,
    select: { id: true },
  });
  const postIds = posts.map((post) => post.id);

  const deletedComments = postIds.length
    ? await prisma.comments.deleteMany({
        where: {
          organizationId,
          OR: [
            { postId: { in: postIds } },
            { content: { contains: smokeId } },
          ],
        },
      })
    : { count: 0 };

  const deletedSnapshots = postIds.length
    ? await prisma.snapsMetricSnapshot.deleteMany({
        where: {
          organizationId,
          OR: [
            { postId: { in: postIds } },
            ...(integrationId ? [{ integrationId }] : []),
          ],
        },
      })
    : { count: 0 };

  const updatedPosts = postIds.length
    ? await prisma.post.updateMany({
        where: { id: { in: postIds }, organizationId },
        data: { deletedAt: now },
      })
    : { count: 0 };

  const updatedIntegrations = await prisma.integration.updateMany({
    where: {
      organizationId,
      OR: [
        ...(integrationId ? [{ id: integrationId }] : []),
        { internalId: sandboxInternalId(smokeId) },
      ],
    },
    data: {
      deletedAt: now,
      disabled: true,
    },
  });

  return {
    posts: updatedPosts.count,
    comments: deletedComments.count,
    snapshots: deletedSnapshots.count,
    integrations: updatedIntegrations.count,
  };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const commands = {
    seed,
    'mark-post': markPost,
    cleanup,
  };
  const run = commands[args.command];
  if (!run) {
    throw new Error(`unknown command: ${args.command || '(missing)'}`);
  }
  const result = await run(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
