import { startCrawlWorker } from './crawl.worker';
import { startQualifyWorker } from './qualify.worker';
import { startDispatchWorker } from './dispatch.worker';
import { startFeedbackWorker } from './feedback.worker';
import { schedulerBoot } from './scheduler';

startCrawlWorker();
startQualifyWorker();
startDispatchWorker();
startFeedbackWorker();

void schedulerBoot();
