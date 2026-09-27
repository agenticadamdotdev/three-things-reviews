import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import * as schema from './schema';

// Cloudflare D1, bound as DB in wrangler.jsonc. `env` from cloudflare:workers is available at module scope.
export const db = drizzle((env as unknown as { DB: D1Database }).DB, { schema });
