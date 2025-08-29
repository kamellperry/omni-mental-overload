import { stableStringify, sha256 } from '../../lib/hash';
import * as repo from './campaign.repo';
import type { CreateCampaignInput } from './campaign.schema';

export const create = async (input: CreateCampaignInput) => {
  const criteriaStr = stableStringify(input.criteria);
  const criteriaHash = sha256(criteriaStr);
  return repo.createCampaign(input.name, input.criteria, criteriaHash);
};

