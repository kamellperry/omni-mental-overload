import { Router } from 'express';
import { z } from 'zod';
import { createQueue } from '../lib/queue';
import * as jobs from '../features/jobs/job.repo';
import * as leads from '../features/leads/lead.repo';
import { createCampaignSchema, discoverSchema, qualifySchema } from '../features/campaigns/campaign.schema';
import * as campaigns from '../features/campaigns/campaign.service';

export const campaignsRouter = Router();

campaignsRouter.post('/', async (req, res, next) => {
  try {
    const body = createCampaignSchema.parse(req.body);
    const campaign = await campaigns.create(body);
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/:id/discover', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = discoverSchema.parse(req.body);
    const crawlQueue = createQueue('crawl');
    const job = await crawlQueue.add(
      'crawl.seed',
      { campaignId: id, ...body },
      { removeOnComplete: true, removeOnFail: { age: 86400 } },
    );
    await jobs.createJob({ id: String(job.id), campaignId: id, type: 'crawl.seed' });
    res.json({ job_id: job.id });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/:id/qualify', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = qualifySchema.parse(req.body ?? {});
    const qualifyQueue = createQueue('qualify');
    const job = await qualifyQueue.add(
      'qualify.campaign',
      { campaignId: id, ...body },
      { removeOnComplete: true, removeOnFail: { age: 86400 } },
    );
    await jobs.createJob({ id: String(job.id), campaignId: id, type: 'qualify.campaign' });
    res.json({ job_id: job.id });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get('/:id/leads', async (req, res, next) => {
  try {
    const { id } = req.params;
    const take = z.coerce.number().int().min(1).max(1000).parse(req.query.limit ?? 50);
    const items = await leads.listByCampaign(id, take);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});
