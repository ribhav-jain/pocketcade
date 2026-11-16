// /privacy/: the privacy topics, adapted to what the portal does today (no Settings
// page and no export yet). Plain-language product copy, not legal advice; reviewed before launch.
import { repoUrl } from '../../lib/build-info';
import { pageMeta, SITE_NAME } from '../../lib/seo';

const UPDATED = '11 November 2026';

export const metadata = pageMeta({
  path: '/privacy/',
  title: `Privacy · ${SITE_NAME}`,
  description:
    'Pocketcade keeps your game data on your device. No accounts, no analytics, no ads, no trackers and no cookies.',
});

export default function Privacy() {
  const repo = repoUrl();
  return (
    <article className="doc-page">
      <h1>Privacy</h1>
      <p className="doc-lede">
        {SITE_NAME} keeps your game data on this device. Nothing you do here is sent to us.
      </p>

      <section className="info-card">
        <h2>What is stored on your device</h2>
        <p>
          The site saves a few things in your browser&apos;s local storage, under keys that start
          with <code>pocketcade:v1:</code>:
        </p>
        <ul>
          <li>
            <strong>Settings:</strong> whether sound is muted and the initials you last entered.
          </li>
          <li>
            <strong>Play history:</strong> which games you played, how often, and when you last
            played each one. It fills the &ldquo;Continue playing&rdquo; row.
          </li>
          <li>
            <strong>Game saves:</strong> each game&apos;s progress and options, kept separately per
            game.
          </li>
          <li>
            <strong>Local leaderboards:</strong> your best scores, with the initials and date of
            each.
          </li>
        </ul>
        <p>
          It also keeps one timestamp in session storage, so you are not asked to reload for an
          update more than once every five minutes.
        </p>
      </section>

      <section className="info-card">
        <h2>What is not collected</h2>
        <p>
          There are no accounts, no analytics, no ads and no trackers. The pages load no third-party
          scripts or fonts and set no cookies.
        </p>
      </section>

      <section className="info-card">
        <h2>Hosting</h2>
        <p>
          The site is served by Vercel, which may process request data such as your IP address and
          browser details in its server logs. See{' '}
          <a href="https://vercel.com/legal/privacy-notice">Vercel&apos;s privacy notice</a>.
        </p>
      </section>

      <section className="info-card">
        <h2>Bug reports</h2>
        <p>
          If a game crashes, the &ldquo;Report a bug&rdquo; button opens a new issue on GitHub,
          where GitHub&apos;s terms apply. The report is filled in with the game, its version, the
          build, the error and your browser details, and nothing is sent until you submit it there
          yourself.
        </p>
      </section>

      <section className="info-card">
        <h2>Deleting your data</h2>
        <p>
          To remove everything {SITE_NAME} saved, clear this site&apos;s data in your browser&apos;s
          settings (usually under site settings or privacy).
        </p>
      </section>

      <section className="info-card">
        <h2>Safari and private browsing</h2>
        <p>
          Safari may delete a site&apos;s saved data after seven days of using Safari without
          visiting it; sites added to the Home Screen are not affected. In a private window, saves
          may last only until you close it.
        </p>
      </section>

      <section className="info-card">
        <h2>Children</h2>
        <p>{SITE_NAME} is for all ages and collects no personal data from anyone.</p>
      </section>

      <section className="info-card">
        <h2>Changes and contact</h2>
        <p>
          Last updated {UPDATED}.{' '}
          {repo ? (
            <>
              Earlier versions are in the <a href={repo}>public repository</a>, and you can ask a
              question there by opening an issue.
            </>
          ) : (
            'Changes to this page will be listed in the public code repository.'
          )}
        </p>
      </section>
    </article>
  );
}
