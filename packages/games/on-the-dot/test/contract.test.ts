// The shared game contract suite, run against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import onTheDot from '../src/index.ts';

runContractSuite(onTheDot, { load: () => import('../src/index.ts') });
