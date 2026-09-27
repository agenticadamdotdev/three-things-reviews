import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { hashPassword, verifyPassword } from "./password";
import { sql } from "drizzle-orm";
import { db } from "../database/db";
import * as schema from "../database/schema";

const secret = process.env.BETTER_AUTH_SECRET || (process.env.NODE_ENV === 'test' ? 'test-secret-must-be-at-least-32-characters-long' : undefined);
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET environment variable is required for session encryption. Please set it in your .env file.");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      ...schema,
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // PBKDF2 through WebCrypto: native on Workers, so sign-in stays well inside CPU limits.
    password: { hash: hashPassword, verify: verifyPassword },
  },
  plugins: [
    bearer(),
  ],
  user: {
    additionalFields: {
      isSystemAdmin: {
        type: "boolean",
        defaultValue: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Strictly allow only defined schema fields
          const allowedFields = ['id', 'name', 'email', 'emailVerified', 'image', 'isSystemAdmin', 'createdAt', 'updatedAt'];
          const userData: any = {};

          for (const field of allowedFields) {
            if ((user as any)[field] !== undefined) {
              userData[field] = (user as any)[field];
            }
          }

          // Single-owner install: the first account becomes the admin and every later sign-up is refused.
          const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
          if (result && Number(result.count) > 0) {
            throw new APIError("FORBIDDEN", { message: "Sign-up is closed." });
          }
          userData.isSystemAdmin = true;

          return { data: userData };
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  // Secret for session encryption/signing
  secret,
  // Base URL for auth endpoints
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000/api/auth",
  trustedOrigins: process.env.AUTH_TRUSTED_ORIGINS 
    ? process.env.AUTH_TRUSTED_ORIGINS.split(',').map(o => o.trim())
    : [
        "http://localhost:5180", // Admin Frontend
        "http://localhost:3000", // Swagger / Local API
        "http://localhost",       // Tests
        "http://localhost:5174",
      ],
});
