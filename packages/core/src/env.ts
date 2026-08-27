import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().startsWith('postgres'),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

  ENCRYPTION_MASTER_KEY: z
    .string()
    .refine((v) => {
      try {
        return Buffer.from(v, 'base64').length === 32;
      } catch {
        return false;
      }
    }, {
      message: 'ENCRYPTION_MASTER_KEY must be 32 bytes, base64-encoded. Run: openssl rand -base64 32 (or node crypto.randomBytes(32).toString("base64"))',
    }),

  UPWORK_MCP_URL: z.string().url().default('https://mcp.upwork.com/mcp'),
  UPWORK_OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/upwork/callback'),
  UPWORK_CLIENT_ID: z.string().optional(),
  UPWORK_CLIENT_SECRET: z.string().optional(),

  POLL_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(5),
  POLL_JITTER_SECONDS: z.coerce.number().int().min(0).default(90),
  POLL_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(10),
  POLL_MAX_JOBS_PER_RUN: z.coerce.number().int().min(1).max(500).default(100),
  POLL_MIN_SECONDS_BETWEEN_TOOL_CALLS: z.coerce.number().min(0).default(1.5),

  WHATSAPP_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v21.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GOOGLE_VERTEX_PROJECT: z.string().optional(),
  GOOGLE_VERTEX_LOCATION: z.string().default('us-central1'),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_VERTEX_CREDENTIALS_B64: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),

  TRIGGER_SECRET_KEY: z.string().optional(),
  TRIGGER_API_URL: z.string().url().default('https://api.trigger.dev'),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof schema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment configuration');
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export const env = process.env.NODE_ENV === 'test' 
  ? ({} as unknown as Env)
  : new Proxy({} as Env, {
      get(_target, prop: string) {
        return getEnv()[prop as keyof Env];
      },
    });
