import { PostgresStore } from '@mastra/pg';

export const pStore = new PostgresStore({
  id: 'snaps-store',
  connectionString: process.env.DATABASE_URL!,
});
