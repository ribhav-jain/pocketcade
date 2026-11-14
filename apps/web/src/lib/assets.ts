// Third-party asset rows for /licenses/, read from the repo's ASSETS.md at build time so the page and the
// file cannot drift apart. Build time only: Server Components.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AssetRow {
  id: string;
  title: string;
  author: string;
  license: string;
  url: string;
  files: string;
}

const plain = (cell: string) =>
  cell
    .trim()
    .replace(/`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

/** Rows of the ASSETS.md table (columns: ID, Title, Author, License, URL, Files). */
export function parseAssets(markdown: string): AssetRow[] {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\|\s*`[a-z0-9-]+`/.test(line))
    .map((line) => {
      const [id, title, author, license, url, files] = line.split('|').slice(1, 7).map(plain);
      return {
        id: id!,
        title: title!,
        author: author!,
        license: license!,
        url: url!,
        files: files!,
      };
    });
}

/** `next build` runs in apps/web, locally and on Vercel (Root Directory apps/web). */
export function readAssets(): AssetRow[] {
  return parseAssets(readFileSync(join(process.cwd(), '..', '..', 'ASSETS.md'), 'utf8'));
}
