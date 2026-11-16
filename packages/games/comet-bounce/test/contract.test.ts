// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import cometBounce from '../src/index.ts';

runContractSuite(cometBounce, { load: () => import('../src/index.ts') });
