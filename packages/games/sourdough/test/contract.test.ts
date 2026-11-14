// The shared game contract suite against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import sourdough from '../src/index.ts';

runContractSuite(sourdough, { load: () => import('../src/index.ts') });
