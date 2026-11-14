'use client';
// The player's error cards: the crash card and a message with one Reload button (update
// notice, player render error). Each moves focus to its primary action when it appears.
import type { CrashReport } from '@pocketcade/host';
import { useEffect, useRef, useState } from 'react';
import { bugReportUrl, crashDetails } from '../lib/player';

function usePrimaryFocus() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return ref;
}

const reload = () => location.reload();

export function ReloadCard({ text, label }: { text: string; label: string }) {
  const primary = usePrimaryFocus();
  return (
    <div className="crash" role="alert">
      <p>{text}</p>
      <button type="button" ref={primary} className="primary" onClick={reload}>
        {label}
      </button>
    </div>
  );
}

function headline(errorName: string, title: string): string {
  switch (errorName) {
    case 'ChunkLoadError':
      return "Couldn't load the game. Check your connection.";
    case 'MountTimeout':
      return 'Took too long to start';
    case 'ApiVersionMismatch':
      return 'This game needs a newer version of Pocketcade';
    case 'InvalidGameMeta':
      return `Something went wrong loading ${title}`;
    default:
      return `${title} stopped working`;
  }
}

export function CrashCard(props: {
  report: CrashReport;
  /** the third crash of this game within 60 s */
  crashLoop: boolean;
  /** Retry clicks before this crash; after one, "Reload page" joins Retry */
  retries: number;
  title: string;
  /** GitHub repository for "Report a bug"; hidden when null */
  repoUrl: string | null;
  onRetry: () => void;
  onCopied: () => void;
}) {
  const { report, title, repoUrl, onRetry } = props;
  const primary = usePrimaryFocus();
  const [details, setDetails] = useState<string | null>(null);

  async function copyDetails(): Promise<void> {
    const text = crashDetails(report);
    try {
      await navigator.clipboard.writeText(text);
      props.onCopied();
    } catch {
      setDetails(text); // no clipboard access: show the text to copy by hand
    }
  }

  return (
    <div className="crash" role="alert" data-error={report.errorName}>
      <p>{headline(report.errorName, title)}</p>
      {props.crashLoop && (
        <p className="muted">This game keeps crashing. Reporting it helps us fix it.</p>
      )}
      <div className="crash-actions">
        {report.errorName === 'ChunkLoadError' ? (
          <>
            <button type="button" ref={primary} className="primary" onClick={onRetry}>
              Retry
            </button>
            {props.retries > 0 && (
              <button type="button" onClick={reload}>
                Reload page
              </button>
            )}
          </>
        ) : report.errorName === 'ApiVersionMismatch' ? (
          <button type="button" ref={primary} className="primary" onClick={reload}>
            Reload page
          </button>
        ) : (
          <>
            <button type="button" ref={primary} className="primary" onClick={onRetry}>
              Restart
            </button>
            <button type="button" onClick={() => void copyDetails()}>
              Copy details
            </button>
            {repoUrl && (
              <a
                className="button"
                href={bugReportUrl(repoUrl, report)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Report a bug
              </a>
            )}
          </>
        )}
      </div>
      {details && (
        <textarea
          className="details"
          readOnly
          value={details}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Crash details"
        />
      )}
    </div>
  );
}
