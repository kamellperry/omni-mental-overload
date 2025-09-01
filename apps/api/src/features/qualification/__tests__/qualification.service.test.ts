import { describe, it, expect } from 'bun:test';
import { type Prisma } from '../../../generated/prisma/client';
import { runQualification } from '../qualification.service';

function makeDeps(overrides: Partial<Parameters<typeof runQualification>[1]> = {}) {
  const calls: Record<string, unknown[]> = {};
  const record = (k: string, v: unknown) => { (calls[k] ||= [] as unknown[]).push(v); };

  const now = new Date();
  const defaultDeps = {
    getCampaign: async (_id: string) => ({ id: 'c1', criteria: {} as Prisma.JsonValue, criteriaHash: 'crit' }),
    listShortlist: async (_id: string, _limit: number) => [
      { username: 'alice', versionHash: 'vh1', followers: 10, recentActivityAt: now, updatedAt: now, features: {} as Prisma.JsonValue },
    ],
    hasRecentLLMScore: async () => false,
    getRawProfiles: async (_users: string[]) => [{ username: 'alice', payload: { captions: ['hi'], images: [{ url: 'http://x/a.jpg' }] } as unknown as Prisma.JsonValue }],
    insertLLMScore: async (x: unknown) => record('insertLLMScore', x),
    upsertLead: async (x: unknown) => record('upsertLead', x),
    generateJson: async () => ({ qualified: true, confidence: 0.9, score: 90, reasons: ['ok'], flags: [] }),
  };
  return { deps: { ...defaultDeps, ...overrides } as any, calls };
}

describe('qualification.service', () => {
  it('skips when cached within TTL', async () => {
    const { deps, calls } = makeDeps({ hasRecentLLMScore: async () => true });
    const out = await runQualification({ campaignId: 'c1', batchSize: 10 }, deps);
    expect(out.processed).toBe(1);
    expect(out.skipped).toBe(1);
    expect((calls.insertLLMScore ?? []).length).toBe(0);
    expect((calls.upsertLead ?? []).length).toBe(0);
  });

  it('writes LLMScore and Lead on success', async () => {
    const { deps, calls } = makeDeps();
    const out = await runQualification({ campaignId: 'c1', batchSize: 10 }, deps);
    expect(out.processed).toBe(1);
    expect(out.written).toBe(1);
    expect((calls.insertLLMScore ?? []).length).toBe(1);
    expect((calls.upsertLead ?? []).length).toBe(1);
  });

  it('writes conservative fallback on error', async () => {
    const { deps, calls } = makeDeps({ generateJson: async () => { throw new Error('boom'); } });
    const out = await runQualification({ campaignId: 'c1', batchSize: 10 }, deps);
    expect(out.processed).toBe(1);
    expect(out.errors).toBe(1);
    expect((calls.insertLLMScore ?? []).length).toBe(1);
    expect((calls.upsertLead ?? []).length).toBe(1);
  });
});

