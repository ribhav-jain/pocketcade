// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import starlap from '../src/index.ts';

runContractSuite(starlap, { load: () => import('../src/index.ts') });
