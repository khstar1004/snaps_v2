export * from './post-workflows/post.workflow.v1.0.1';
export * from './post-workflows/post.workflow.v1.0.2';
// v1.0.3 and v1.0.4 are ported verbatim from upstream postiz-app and registered
// so the worker knows the workflow types, but nothing dispatches them yet. Two
// call sites still name 'postWorkflowV102' and both have to change together:
//   apps/orchestrator/src/activities/post.activity.ts (missing-post sweep)
//   libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts (normal publish)
// Registering extra workflow types is inert - Temporal pins each running
// execution to the version it started on - so flipping those strings is the only
// step that changes behavior, and it needs a live Temporal run to validate first.
// See docs/snaps-post-workflow-upgrade.md.
export * from './post-workflows/post.workflow.v1.0.3';
export * from './post-workflows/post.workflow.v1.0.4';
export * from './autopost.workflow';
export * from './digest.email.workflow';
export * from './missing.post.workflow';
export * from './send.email.workflow';
export * from './refresh.token.workflow';
export * from './streak.workflow';
