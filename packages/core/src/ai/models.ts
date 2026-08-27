import type { ProviderId } from './registry.ts';

/**
 * Auto-fetches available models from providers that support model listing (§12.4).
 */
export async function fetchAvailableModels(
  provider: ProviderId,
  apiKey: string,
  config?: Record<string, string>,
): Promise<string[]> {
  try {
    switch (provider) {
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        return data.data?.map((m: any) => m.id) ?? [];
      }

      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        return (
          data.data
            ?.map((m: any) => m.id)
            .filter((id: string) => id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3'))
            .sort() ?? []
        );
      }

      case 'google': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        return (
          data.models
            ?.map((m: any) => m.name.replace('models/', ''))
            .filter((name: string) => name.startsWith('gemini'))
            .sort() ?? []
        );
      }

      case 'ollama': {
        const baseUrl = config?.baseUrl || 'http://localhost:11434';
        const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        return data.models?.map((m: any) => m.name) ?? [];
      }

      case 'openrouter': {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        return data.data?.map((m: any) => m.id).slice(0, 50) ?? [];
      }

      case 'aws_bedrock': {
        // Return standard supported foundation models on Bedrock
        return [
          'anthropic.claude-3-5-sonnet-20241022-v2:0',
          'anthropic.claude-3-haiku-20240307-v1:0',
          'amazon.nova-pro-v1:0',
          'amazon.nova-lite-v1:0',
          'meta.llama3-3-70b-instruct-v1:0',
          'mistral.mistral-large-2402-v1:0',
        ];
      }

      default:
        return [];
    }
  } catch {
    return [];
  }
}
