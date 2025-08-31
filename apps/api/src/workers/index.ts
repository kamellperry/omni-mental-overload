import { startCrawlWorker } from './crawl.worker';
import { startQualifyWorker } from './qualify.worker';
import { startDispatchWorker } from './dispatch.worker';
import { startFeedbackWorker } from './feedback.worker';
import { schedulerBoot } from './scheduler';
import { startAuthPurgeWorker } from './auth-purge.worker';

startCrawlWorker();
startQualifyWorker();
startDispatchWorker();
startFeedbackWorker();

void startAuthPurgeWorker();
void schedulerBoot();
