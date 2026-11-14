// CT-01..CT-14 against the real game in Chromium (SDK-903).
import { runContractSuite } from '@pocketcade/sdk/testing';
import glowworm from '../src/index.ts';

runContractSuite(glowworm, { load: () => import('../src/index.ts') });
