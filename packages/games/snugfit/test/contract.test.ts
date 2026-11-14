// The SDK contract suite against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import snugfit from '../src/index.ts';

runContractSuite(snugfit, { load: () => import('../src/index.ts') });
