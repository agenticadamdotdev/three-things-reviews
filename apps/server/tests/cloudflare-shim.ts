// Bun has no `cloudflare:workers` module; unit tests never touch the database, so an empty env is enough.
import { mock } from 'bun:test';
mock.module('cloudflare:workers', () => ({ env: {} }));
