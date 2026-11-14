// The shared SDK contract suite against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import molehills from '../src/index.ts';

runContractSuite(molehills, { load: () => import('../src/index.ts') });
