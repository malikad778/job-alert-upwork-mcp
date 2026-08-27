export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'google_vertex'
  | 'openrouter'
  | 'ollama'
  | 'custom'
  | 'aws_bedrock';

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  authKind: 'api_key' | 'service_account' | 'none';
  configFields: { key: string; label: string; required: boolean; placeholder?: string }[];
  keyPattern?: RegExp;
  docsUrl: string;
  getKeyUrl: string;
  supportsModelListing: boolean;
  knownModels: { id: string; label: string; contextWindow: number; inputPer1M: number; outputPer1M: number }[];
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    authKind: 'api_key',
    configFields: [],
    keyPattern: /^sk-ant-/,
    docsUrl: 'https://docs.claude.com',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    supportsModelListing: true,
    knownModels: [
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', contextWindow: 200000, inputPer1M: 3.0, outputPer1M: 15.0 },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', contextWindow: 200000, inputPer1M: 0.8, outputPer1M: 4.0 },
    ],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (GPT-4o)',
    authKind: 'api_key',
    configFields: [{ key: 'organization', label: 'Organization ID', required: false }],
    keyPattern: /^sk-/,
    docsUrl: 'https://platform.openai.com/docs',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    supportsModelListing: true,
    knownModels: [
      { id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128000, inputPer1M: 2.5, outputPer1M: 10.0 },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', contextWindow: 128000, inputPer1M: 0.15, outputPer1M: 0.6 },
    ],
  },
  google: {
    id: 'google',
    label: 'Google Gemini (AI Studio API key)',
    authKind: 'api_key',
    configFields: [],
    keyPattern: /^AIzaSy/,
    docsUrl: 'https://ai.google.dev/docs',
    getKeyUrl: 'https://aistudio.google.com/apikey',
    supportsModelListing: true,
    knownModels: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1000000, inputPer1M: 0.1, outputPer1M: 0.4 },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextWindow: 2000000, inputPer1M: 1.25, outputPer1M: 5.0 },
    ],
  },
  google_vertex: {
    id: 'google_vertex',
    label: 'Google Gemini via Vertex AI (GCP)',
    authKind: 'service_account',
    configFields: [
      { key: 'project', label: 'GCP Project ID', required: true, placeholder: 'my-project-123456' },
      { key: 'location', label: 'Region', required: true, placeholder: 'us-central1' },
    ],
    docsUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs',
    getKeyUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
    supportsModelListing: false,
    knownModels: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Vertex)', contextWindow: 2000000, inputPer1M: 1.25, outputPer1M: 5.0 },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Vertex)', contextWindow: 1000000, inputPer1M: 0.1, outputPer1M: 0.4 },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Vertex)', contextWindow: 2000000, inputPer1M: 1.25, outputPer1M: 5.0 },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Vertex)', contextWindow: 1000000, inputPer1M: 0.075, outputPer1M: 0.3 },
    ],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (Multi-model)',
    authKind: 'api_key',
    configFields: [],
    keyPattern: /^sk-or-/,
    docsUrl: 'https://openrouter.ai/docs',
    getKeyUrl: 'https://openrouter.ai/keys',
    supportsModelListing: true,
    knownModels: [
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)', contextWindow: 200000, inputPer1M: 3.0, outputPer1M: 15.0 },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (OpenRouter)', contextWindow: 128000, inputPer1M: 0.4, outputPer1M: 0.4 },
    ],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (Local & Free)',
    authKind: 'none',
    configFields: [
      { key: 'baseUrl', label: 'Ollama Server URL', required: true, placeholder: 'http://localhost:11434' },
    ],
    docsUrl: 'https://ollama.com',
    getKeyUrl: 'https://ollama.com/download',
    supportsModelListing: true,
    knownModels: [
      { id: 'llama3.2', label: 'Llama 3.2 (Local)', contextWindow: 128000, inputPer1M: 0.0, outputPer1M: 0.0 },
      { id: 'deepseek-r1', label: 'DeepSeek R1 (Local)', contextWindow: 64000, inputPer1M: 0.0, outputPer1M: 0.0 },
    ],
  },
  aws_bedrock: {
    id: 'aws_bedrock',
    label: 'AWS Bedrock',
    authKind: 'api_key',
    configFields: [
      { key: 'region', label: 'AWS Region', required: true, placeholder: 'us-east-1' },
      { key: 'accessKeyId', label: 'AWS Access Key ID', required: true, placeholder: 'AKIAIOSFODNN7EXAMPLE' }
    ],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/',
    getKeyUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
    supportsModelListing: true,
    knownModels: [
      { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet (Bedrock)', contextWindow: 200000, inputPer1M: 3.0, outputPer1M: 15.0 },
      { id: 'anthropic.claude-3-haiku-20240307-v1:0', label: 'Claude 3 Haiku (Bedrock)', contextWindow: 200000, inputPer1M: 0.25, outputPer1M: 1.25 },
      { id: 'amazon.nova-pro-v1:0', label: 'Amazon Nova Pro', contextWindow: 300000, inputPer1M: 0.8, outputPer1M: 3.2 },
      { id: 'amazon.nova-lite-v1:0', label: 'Amazon Nova Lite', contextWindow: 300000, inputPer1M: 0.06, outputPer1M: 0.24 },
      { id: 'meta.llama3-3-70b-instruct-v1:0', label: 'Llama 3.3 70B (Bedrock)', contextWindow: 128000, inputPer1M: 0.72, outputPer1M: 0.72 },
      { id: 'mistral.mistral-large-2402-v1:0', label: 'Mistral Large (Bedrock)', contextWindow: 128000, inputPer1M: 2.0, outputPer1M: 6.0 }
    ],
  },
  custom: {
    id: 'custom',
    label: 'Custom OpenAI-Compatible API',
    authKind: 'api_key',
    configFields: [
      { key: 'baseUrl', label: 'API Base URL', required: true, placeholder: 'https://api.together.xyz/v1' },
      { key: 'modelName', label: 'Model Name', required: true, placeholder: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo' },
    ],
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    getKeyUrl: '',
    supportsModelListing: false,
    knownModels: [],
  },
};
