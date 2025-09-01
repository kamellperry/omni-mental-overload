import { Router } from 'express';
import { z } from 'zod';
import { createQueue } from '../lib/queue';
import * as jobs from '../features/jobs/job.repo';
import * as leads from '../features/leads/lead.repo';
import { createCampaignSchema, discoverSchema, qualifySchema } from '../features/campaigns/campaign.schema';
import * as campaigns from '../features/campaigns/campaign.service';
import { registerCampaignQualify, removeCampaignQualify } from '../workers/scheduler';
import { createSeedSchema } from '../features/seeds/seed.schema';
import * as seeds from '../features/seeds/seed.repo';

export const campaignsRouter = Router();

campaignsRouter.post('/', async (req, res, next) => {
  try {
    const body = createCampaignSchema.parse(req.body);
    const campaign = await campaigns.create(body);
    // Bind per-campaign qualify schedule
    await registerCampaignQualify(campaign.id);
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

campaignsRouter.post('/:id/activate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const out = await campaigns.activate(id);
    await registerCampaignQualify(id);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/:id/deactivate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const out = await campaigns.deactivate(id);
    await removeCampaignQualify(id);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const out = await campaigns.softDelete(id);
    await removeCampaignQualify(id);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/:id/seeds', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = createSeedSchema.parse(req.body);
    const created = await seeds.createSeed(id, body.type, body.value, body.enabled);
    res.json(created);
  } catch (err) {
    next(err);
  }
});
