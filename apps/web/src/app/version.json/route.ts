// /version.json: a static GET Route Handler, exported at build time.
import { buildInfo } from '../../lib/build-info';

export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json(buildInfo());
}
