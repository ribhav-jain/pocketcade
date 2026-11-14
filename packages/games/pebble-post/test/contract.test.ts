// The SDK contract suite against the real game in Chromium.
import { runContractSuite } from '@pocketcade/sdk/testing';
import pebblePost from '../src/index.ts';

runContractSuite(pebblePost, { load: () => import('../src/index.ts') });
