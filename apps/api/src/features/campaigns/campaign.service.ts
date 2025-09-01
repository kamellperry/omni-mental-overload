import { stableStringify, sha256 } from '../../lib/hash';
import * as repo from './campaign.repo';
import type { CreateCampaignInput } from './campaign.schema';
import { refreshForCampaign } from '../candidates/candidate.service';

export const create = async (input: CreateCampaignInput) => {
  const criteriaStr = stableStringify(input.criteria);
  const criteriaHash = sha256(criteriaStr);
  const created = await repo.createCampaign(input.name, input.criteria, criteriaHash);
  // Initialize compiled WHERE and candidates set (no-op if none match yet)
  try { await refreshForCampaign(created.id); } catch { /* ignore on create */ }
  return created;
};

export const activate = async (id: string) => repo.setActive(id, true);
export const deactivate = async (id: string) => repo.setActive(id, false);
export const softDelete = async (id: string) => repo.softDelete(id);
export const restore = async (id: string) => repo.restore(id);
