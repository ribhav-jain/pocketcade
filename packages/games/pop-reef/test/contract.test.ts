// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import popReef from '../src/index.ts';

runContractSuite(popReef, { load: () => import('../src/index.ts') });
