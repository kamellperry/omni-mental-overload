export type LLMProvider = 'ollama' | 'openai';

export const LLM_CONFIG = {
  BASE_URL: {
    ollama: 'http://localhost:11434/v1',
    openai: 'https://api.openai.com/v1',
  },
  MODEL: {
    ollama: 'gemma3:4b',
    openai: 'gpt-5-mini',
  },
  API_KEY: {
    ollama: 'ollama',
    openai: process.env.OPENAI_API_KEY || '',
  },
} as const satisfies {
  BASE_URL: Record<LLMProvider, string>;
  MODEL: Record<LLMProvider, string>;
  API_KEY: Record<LLMProvider, string>;
};

export const QUAL_CONFIG = {
  LLM_PROVIDER: process.env.LLM_PROVIDER as LLMProvider || 'ollama',
  LLM_MODEL: process.env.LLM_MODEL || LLM_CONFIG.MODEL.ollama,
  LLM_TIMEOUT_MS: Number(process.env.LLM_TIMEOUT_MS || 15000),
  LLM_MAX_TOKENS: Number(process.env.LLM_MAX_TOKENS || 500),
  LLM_CONCURRENCY: Number(process.env.LLM_CONCURRENCY || 5),
  LLM_CACHE_TTL_DAYS: Number(process.env.LLM_CACHE_TTL_DAYS || 14),
  LLM_SCORE_THRESHOLD: Number(process.env.LLM_SCORE_THRESHOLD || 70),
} as const;

export type QualConfig = typeof QUAL_CONFIG;
export type LLMConfig = typeof LLM_CONFIG;