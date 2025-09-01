import OpenAI from 'openai';
import { z } from 'zod';
import { LLM_CONFIG, QUAL_CONFIG, type LLMProvider } from '../features/qualification/qualification.config';

const clients = new Map<LLMProvider, OpenAI>();

export function getLLMClient(provider: LLMProvider): OpenAI {
  const existing = clients.get(provider);
  if (existing) return existing;
  const created = new OpenAI({ baseURL: LLM_CONFIG.BASE_URL[provider], apiKey: LLM_CONFIG.API_KEY[provider] });
  clients.set(provider, created);
  return created;
}

function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

async function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race<T>([
    p,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('llm_timeout')), timeoutMs)),
  ]);
}

export async function generateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  opts?: { timeoutMs?: number; model?: string; maxTokens?: number; provider?: LLMProvider; },
): Promise<T> {
  const provider: LLMProvider = opts?.provider || QUAL_CONFIG.LLM_PROVIDER;
  const model = opts?.model || QUAL_CONFIG.LLM_MODEL;
  const timeoutMs = opts?.timeoutMs ?? QUAL_CONFIG.LLM_TIMEOUT_MS;
  const maxTokens = opts?.maxTokens ?? QUAL_CONFIG.LLM_MAX_TOKENS;

  const c = getLLMClient(provider);
  const resp = await withTimeout(
    c.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
    }),
    timeoutMs,
  );

  const content = resp.choices?.[0]?.message?.content ?? '';
  const text = typeof content === 'string' ? content : String(content ?? '');
  const jsonStr = extractJson(text.trim()) ?? text.trim();
  const parsed = JSON.parse(jsonStr) as unknown;
  return schema.parse(parsed);
}
