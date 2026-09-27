import { defineConfig } from 'drizzle-kit';

// D1 (SQLite) migrations, applied with `wrangler d1 migrations apply`.
export default defineConfig({
  schema: './src/infrastructure/database/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
});
