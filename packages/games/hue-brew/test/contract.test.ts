// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import hueBrew from '../src/index.ts';

runContractSuite(hueBrew, { load: () => import('../src/index.ts') });
