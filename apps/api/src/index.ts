import 'dotenv/config';
import express from 'express';
import { campaignsRouter } from './http/campaigns.router';
import { jobsRouter } from './http/jobs.router';
import { healthRouter } from './http/health.router';
import { errorMiddleware } from './lib/errors';

const app = express();
app.use(express.json());

app.use('/health', healthRouter);
app.use('/campaigns', campaignsRouter);
app.use('/jobs', jobsRouter);

app.use(errorMiddleware);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API listening on :${port}`));
