// The shared contract suite, run against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import baoBolt from '../src/index.ts';

runContractSuite(baoBolt, { load: () => import('../src/index.ts') });
