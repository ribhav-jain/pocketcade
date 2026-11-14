// CT-01..CT-14 against the real game in Chromium (SDK-903).
import { runContractSuite } from '@pocketcade/sdk/testing';
import popReef from '../src/index.ts';

runContractSuite(popReef, { load: () => import('../src/index.ts') });
