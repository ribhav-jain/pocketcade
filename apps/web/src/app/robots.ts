// /robots.txt: production lets crawlers in (so they can read the pre-launch noindex header) and
// names the sitemap; preview builds disallow everything.
import type { MetadataRoute } from 'next';
import { deployEnv } from '../lib/build-info';
import { siteUrl } from '../lib/seo';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  if (deployEnv() === 'preview') return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${siteUrl()}/sitemap.xml` };
}
