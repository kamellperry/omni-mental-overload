import { startCrawlWorker } from './crawl.worker';
import { startQualifyWorker } from './qualify.worker';
import { startDispatchWorker } from './dispatch.worker';

startCrawlWorker();
startQualifyWorker();
startDispatchWorker();