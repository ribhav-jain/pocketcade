// The contract suite against the real game, in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import glowworm from '../src/index.ts';

runContractSuite(glowworm, { load: () => import('../src/index.ts') });
