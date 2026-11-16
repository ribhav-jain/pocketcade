// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import sunsetSprint from '../src/index.ts';

runContractSuite(sunsetSprint, { load: () => import('../src/index.ts') });
