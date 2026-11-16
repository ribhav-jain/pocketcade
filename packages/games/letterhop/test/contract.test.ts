// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import letterhop from '../src/index.ts';

runContractSuite(letterhop, { load: () => import('../src/index.ts') });
