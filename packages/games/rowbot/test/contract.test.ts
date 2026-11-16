// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import rowdy from '../src/index.ts';

runContractSuite(rowdy, { load: () => import('../src/index.ts') });
