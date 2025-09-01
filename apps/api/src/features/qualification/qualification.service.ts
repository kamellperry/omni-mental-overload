import * as shortlist from './shortlist.repo';
import { Prisma } from '../../generated/prisma/client';
import { stableStringify } from '../../lib/hash';
import { generateJson } from '../../lib/llm';
import { QUAL_CONFIG } from './qualification.config';
import { llmOutputSchema, type LLMOutput } from './llm.schema';
import { type ShortlistItem } from './shortlist.repo';

type JsonValue = Prisma.JsonValue;
type InputJsonValue = Prisma.InputJsonValue;

function jsonIsObject(v: unknown): v is Record<string, JsonValue> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function jsonIsArray(v: unknown): v is JsonValue[] {
  return Array.isArray(v);
}

function pickCaptions(payload: JsonValue): string[] {
  if (jsonIsObject(payload)) {
    const caps = payload['captions'];
    if (jsonIsArray(caps)) {
      const out: string[] = [];
      for (const c of caps) {
        if (typeof c === 'string') out.push(c);
        if (out.length >= 3) break;
      }
      return out;
    }
  }
  return [];
}

function pickImageUrls(payload: JsonValue): string[] {
  if (jsonIsObject(payload)) {
    const imgs = payload['images'];
    if (jsonIsArray(imgs)) {
      const out: string[] = [];
      for (const it of imgs) {
        if (jsonIsObject(it)) {
          const u = it['url'];
          if (typeof u === 'string') out.push(u);
          if (out.length >= 3) break;
        }
      }
      return out;
    }
  }
  return [];
}

function pickFeatureStrings(features: JsonValue): { bioTokens: string[]; keywordHits: string[]; } {
  const out = { bioTokens: [] as string[], keywordHits: [] as string[] };
  if (jsonIsObject(features)) {
    const bt = features['bio_tokens'];
    const kh = features['keyword_hits'];
    if (jsonIsArray(bt)) out.bioTokens = bt.filter((x): x is string => typeof x === 'string').slice(0, 24);
    if (jsonIsArray(kh)) out.keywordHits = kh.filter((x): x is string => typeof x === 'string').slice(0, 24);
  }
  return out;
}

function buildPrompt(criteria: JsonValue, item: ShortlistItem, payload: JsonValue): { system: string; user: string; } {
  const criteriaJson = stableStringify(criteria);
  const captions = pickCaptions(payload);
  const images = pickImageUrls(payload);
  const { bioTokens, keywordHits } = pickFeatureStrings(item.features);

  const system = 'You are an expert lead qualifier. Return JSON only matching the required schema.';
  const ctx = {
    username: item.username,
    followers: item.followers,
    recentActivityAt: item.recentActivityAt ? item.recentActivityAt.toISOString() : null,
    features: { bio_tokens: bioTokens, keyword_hits: keywordHits },
    captions,
    images,
  };
  const user = `Campaign criteria JSON:\n${criteriaJson}\n\nProfile context JSON:\n${stableStringify(ctx)}\n\nReturn JSON with keys: qualified (boolean), confidence (0..1), score (0..100), reasons (string[]), flags (string[]).`;
  return { system, user };
}

function toReasonsJson(out: LLMOutput): InputJsonValue {
  const v: Prisma.JsonObject = { reasons: out.reasons, flags: out.flags };
  return v as InputJsonValue;
}

function toErrorReasonsJson(): InputJsonValue {
  const v: Prisma.JsonObject = { reasons: ['llm_error'], flags: [] };
  return v as InputJsonValue;
}

type Deps = {
  getCampaign: typeof shortlist.getCampaign;
  listShortlist: typeof shortlist.listShortlist;
  hasRecentLLMScore: typeof shortlist.hasRecentLLMScore;
  getRawProfiles: typeof shortlist.getRawProfiles;
  insertLLMScore: typeof shortlist.insertLLMScore;
  upsertLead: typeof shortlist.upsertLead;
  generateJson: typeof generateJson;
};

export type QualificationDeps = Deps;

const defaultDeps: Deps = {
  getCampaign: shortlist.getCampaign,
  listShortlist: shortlist.listShortlist,
  hasRecentLLMScore: shortlist.hasRecentLLMScore,
  getRawProfiles: shortlist.getRawProfiles,
  insertLLMScore: shortlist.insertLLMScore,
  upsertLead: shortlist.upsertLead,
  generateJson,
};

async function processOne(
  campaignId: string,
  criteria: JsonValue,
  criteriaHash: string,
  item: ShortlistItem,
  payload: JsonValue,
  deps: Deps,
): Promise<'written' | 'skipped' | 'error'> {
  const notBefore = new Date(Date.now() - QUAL_CONFIG.LLM_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const already = await deps.hasRecentLLMScore(campaignId, item.username, item.versionHash, criteriaHash, notBefore);
  if (already) return 'skipped';

  const { system, user } = buildPrompt(criteria, item, payload);
  try {
    const out = await deps.generateJson(system, user, llmOutputSchema, {
      model: QUAL_CONFIG.LLM_MODEL,
      timeoutMs: QUAL_CONFIG.LLM_TIMEOUT_MS,
      maxTokens: QUAL_CONFIG.LLM_MAX_TOKENS,
      provider: QUAL_CONFIG.LLM_PROVIDER,
    });
    const qualified = Boolean(out.qualified) && Number(out.score) >= QUAL_CONFIG.LLM_SCORE_THRESHOLD;
    await deps.insertLLMScore({
      campaignId,
      username: item.username,
      profileHash: item.versionHash,
      criteriaHash,
      score: out.score,
      confidence: out.confidence,
      reasons: toReasonsJson(out),
    });
    await deps.upsertLead({
      campaignId,
      username: item.username,
      score: out.score,
      qualified,
      reasons: toReasonsJson(out),
    });
    return 'written';
  } catch (_err) {
    // Conservative fallback per spec
    await deps.insertLLMScore({
      campaignId,
      username: item.username,
      profileHash: item.versionHash,
      criteriaHash,
      score: 0,
      confidence: 0,
      reasons: toErrorReasonsJson(),
    });
    await deps.upsertLead({
      campaignId,
      username: item.username,
      score: 0,
      qualified: false,
      reasons: toErrorReasonsJson(),
    });
    return 'error';
  }
}

async function runLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  const queue = items.slice();
  const workers: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    const item = queue.pop();
    if (item === undefined) return;
    const res = await fn(item);
    out.push(res);
    await next();
  };
  const n = Math.max(1, Math.min(limit, items.length));
  for (let k = 0; k < n; k++) workers.push(next());
  await Promise.all(workers);
  return out;
}

export async function runQualification(
  input: { campaignId: string; batchSize: number; },
  deps: Deps = defaultDeps,
): Promise<{
  processed: number;
  written: number;
  skipped: number;
  errors: number;
}> {
  const { campaignId, batchSize } = input;
  const campaign = await deps.getCampaign(campaignId);
  if (!campaign) throw new Error('campaign_not_found');

  const shortlistItems = await deps.listShortlist(campaignId, batchSize);
  const usernames = Array.from(new Set(shortlistItems.map((s) => s.username)));
  const rawProfiles = await deps.getRawProfiles(usernames);
  const payloadByUser = new Map<string, JsonValue>(rawProfiles.map((r) => [r.username, r.payload]));

  const emptyPayload: Prisma.JsonObject = {};
  const tasks = shortlistItems.map((item) => ({ item, payload: payloadByUser.get(item.username) ?? emptyPayload }));

  const results = await runLimited(tasks, QUAL_CONFIG.LLM_CONCURRENCY, async ({ item, payload }) =>
    processOne(campaign.id, campaign.criteria, campaign.criteriaHash, item, payload, deps),
  );

  const processed = results.length;
  const written = results.filter((r) => r === 'written').length;
  const skipped = results.filter((r) => r === 'skipped').length;
  const errors = results.filter((r) => r === 'error').length;

  return { processed, written, skipped, errors };
}
