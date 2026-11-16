// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import sumslide from '../src/index.ts';

runContractSuite(sumslide, { load: () => import('../src/index.ts') });
