import type { Linter } from 'eslint';

export type Kind = 'sdk' | 'host' | 'toolkit' | 'game' | 'web' | 'playground';
export function config(kind: Kind, extra?: Linter.Config[]): Linter.Config[];
