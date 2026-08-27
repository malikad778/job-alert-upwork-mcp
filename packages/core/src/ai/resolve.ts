import { generateText, type LanguageModel } from 'ai';
import type { ProviderId } from './registry.ts';

export type AiCredentialModel = {
  id: string;
  userId: string;
  provider: ProviderId;
  label: string;
  secret: string; // Plaintext secret (already decrypted in memory)
  config: Record<string, string>;
  defaultModel?: string | null;
};

/**
 * Resolves any configured provider into a standard Vercel AI SDK LanguageModel (§12.5).
 * The rest of the application remains completely agnostic of specific provider implementations.
 */
export async function resolveModel(
  cred: AiCredentialModel,
  modelId?: string,
): Promise<LanguageModel> {
  const targetModel = modelId || cred.defaultModel;
  if (!targetModel) {
    throw new Error(`No model specified for provider ${cred.provider}`);
  }

  switch (cred.provider) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const provider = createAnthropic({ apiKey: cred.secret });
      return provider(targetModel) as any;
    }

    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const provider = createOpenAI({
        apiKey: cred.secret,
        organization: cred.config?.organization,
      });
      return provider(targetModel) as any;
    }

    case 'google': {
      // Path A - AI Studio API key (§12.5)
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const provider = createGoogleGenerativeAI({ apiKey: cred.secret });
      return provider(targetModel) as any;
    }

    case 'google_vertex': {
      // Path B - Vertex AI on GCP with service account JSON (§12.5)
      const { createVertex } = await import('@ai-sdk/google-vertex');
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(cred.secret);
      } catch {
        throw new Error(
          'Invalid Vertex AI credentials. Expected a valid service-account JSON containing client_email and private_key.',
        );
      }

      if (!credentials.client_email || !credentials.private_key) {
        throw new Error(
          'The provided Google Cloud JSON is missing client_email or private_key.',
        );
      }

      const project = cred.config?.project || (credentials.project_id as string);
      const location = cred.config?.location || 'us-central1';

      const provider = createVertex({
        project,
        location,
        googleAuthOptions: { credentials },
      });
      return provider(targetModel) as any;
    }

    case 'openrouter': {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      const provider = createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: cred.secret,
      });
      return provider(targetModel) as any;
    }

    case 'ollama': {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      const baseURL = (cred.config?.baseUrl || 'http://localhost:11434').replace(/\/$/, '') + '/v1';
      const provider = createOpenAICompatible({
        name: 'ollama',
        baseURL,
        apiKey: cred.secret || 'ollama',
      });
      return provider(targetModel) as any;
    }

    case 'aws_bedrock': {
      const { createAmazonBedrock } = await import('@ai-sdk/amazon-bedrock');
      const region = cred.config?.region || process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || 'ap-south-1';
      let accessKeyId = cred.config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
      let secretAccessKey = cred.secret || process.env.AWS_SECRET_ACCESS_KEY;
      let sessionToken = cred.config?.sessionToken || process.env.AWS_SESSION_TOKEN;

      if (!accessKeyId || !secretAccessKey) {
        try {
          const { fromNodeProviderChain } = await import('@aws-sdk/credential-providers');
          const ambient = await fromNodeProviderChain()();
          accessKeyId = ambient.accessKeyId;
          secretAccessKey = ambient.secretAccessKey;
          sessionToken = ambient.sessionToken;
        } catch {
          // No ambient credentials available
        }
      }

      const provider = createAmazonBedrock({
        region,
        ...(accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
              ...(sessionToken ? { sessionToken } : {}),
            }
          : {}),
      });
      return provider(targetModel) as any;
    }

    case 'custom': {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      const baseURL = cred.config?.baseUrl || 'https://api.openai.com/v1';
      const provider = createOpenAICompatible({
        name: 'custom',
        baseURL,
        apiKey: cred.secret,
      });
      return provider(targetModel) as any;
    }

    default:
      throw new Error(`Unsupported AI provider: ${cred.provider}`);
  }
}

/**
 * Tests an AI Provider API key with a fast heartbeat ping
 */
export async function testAIConnection(params: {
  provider: ProviderId;
  apiKey: string;
  modelName: string;
  config?: Record<string, string>;
}): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const model = await resolveModel(
      {
        id: 'test',
        userId: 'test',
        provider: params.provider,
        label: 'test',
        secret: params.apiKey,
        config: params.config || {},
        defaultModel: params.modelName,
      },
      params.modelName,
    );

    await generateText({
      model,
      prompt: 'Ping. Respond with OK only.',
      maxTokens: 5,
    });

    return { success: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Authentication failed with provider. Check your API key.',
    };
  }
}
