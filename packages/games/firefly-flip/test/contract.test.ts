// The shared SDK contract suite, run against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import fireflyFlip from '../src/index.ts';

runContractSuite(fireflyFlip, { load: () => import('../src/index.ts') });
