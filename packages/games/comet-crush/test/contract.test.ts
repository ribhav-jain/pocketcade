// The SDK contract suite against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import cometCrush from '../src/index.ts';

runContractSuite(cometCrush, { load: () => import('../src/index.ts') });
