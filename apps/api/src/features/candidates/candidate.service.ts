import { getPrisma } from '../../db/prisma';
import { compileCriteria } from './candidate.compiler';
import { refreshCandidates as repoRefresh, RefreshCandidatesResult } from './candidate.repo';

export interface RefreshForCampaignResult {
  upserted: number;
  evicted: number;
  whereText: string;
}

export async function refreshForCampaign(campaignId: string): Promise<RefreshForCampaignResult> {
  const prisma = getPrisma();
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('campaign_not_found');

  const { where, whereText } = compileCriteria(campaign.criteria);

  // Persist the compiled WHERE for traceability/debugging
  await prisma.campaign.update({ where: { id: campaignId }, data: { criteriaWhere: whereText } });

  const { upserted, evicted }: RefreshCandidatesResult = await repoRefresh(campaignId, where);
  return { upserted, evicted, whereText };
}
