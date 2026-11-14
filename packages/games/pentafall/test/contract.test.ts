// The shared contract suite against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import pentafall from '../src/index.ts';

runContractSuite(pentafall, { load: () => import('../src/index.ts') });
