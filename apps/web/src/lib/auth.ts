import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, users, sessions, accounts, verifications } from '@job-radar/db';

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || 'job-radar-master-secret-key-32-chars-min',
  trustedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://13.234.31.69',
    'https://upwork-mcp.site',
    'http://upwork-mcp.site',
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.APP_URL ? [process.env.APP_URL] : []),
  ],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    generateId: () => crypto.randomUUID(),
    crossSubDomainCookies: {
      enabled: false,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'user',
        /**
         * SECURITY: without input:false better-auth copies any `role` supplied
         * in the sign-up request body straight onto the new user, letting
         * anyone self-register as an admin. With input:false the field is
         * forced to defaultValue on create and can only be changed server-side.
         */
        input: false,
      }
    }
  },
});

export type Session = typeof auth.$Infer.Session;
