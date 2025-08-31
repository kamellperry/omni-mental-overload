import { Router } from 'express';
import * as jobs from '../features/jobs/job.repo';

export const jobsRouter = Router();

jobsRouter.get('/:id', async (req, res, next) => {
  try {
    const job = await jobs.findJob(req.params.id);
    res.json(job ?? {});
  } catch (err) {
    next(err);
  }
});

