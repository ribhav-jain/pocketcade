'use client';
// Native <dialog> helpers: showModal, Escape closes, focus returns to the opener.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LeaderboardDef, ScoreEntry } from '@pocketcade/sdk';
import { getHostServices } from '../lib/host-services';
import { formatDate, formatValue } from '../lib/player';

/** Opens and closes the dialog with `open`; the caller passes its `onClose` to the <dialog> element. */
function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const opener = document.activeElement as HTMLElement | null;
      d.showModal();
      d.addEventListener('close', () => opener?.focus({ preventScroll: true }), { once: true });
    } else if (!open && d.open) d.close();
  }, [open]);
  return ref;
}

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useModal(props.open);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" onClose={props.onClose}>
      <p id="confirm-title" className="dialog-title">
        {props.title}
      </p>
      <div className="dialog-actions">
        <button type="button" autoFocus onClick={() => ref.current?.close()}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            ref.current?.close();
            props.onConfirm();
          }}
        >
          {props.confirm}
        </button>
      </div>
    </dialog>
  );
}

type Row = ScoreEntry & { id: string };

/** the local top 10, read from storage without loading the game chunk. */
export function LeaderboardSheet(props: {
  open: boolean;
  onClose: () => void;
  gameId: string;
  title: string;
  boards: readonly LeaderboardDef[];
  buildId: string;
  newIds: ReadonlySet<string>;
}) {
  const ref = useModal(props.open);
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const board = props.boards[tab];

  useEffect(() => {
    if (!props.open || !board) return;
    let live = true;
    const scores = getHostServices(props.buildId).scores;
    void Promise.all([scores.top(props.gameId, board), scores.entryIds(props.gameId, board)]).then(
      ([top, ids]) => {
        if (live) setRows(top.map((e, i) => ({ ...e, id: ids[i] ?? '' })));
      },
    );
    return () => {
      live = false;
    };
  }, [props.open, props.gameId, props.buildId, board]);

  return (
    <dialog
      ref={ref}
      className="dialog sheet"
      aria-labelledby="lb-title"
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close(); // backdrop
      }}
    >
      <div className="sheet-head">
        <h2 id="lb-title">Leaderboard</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
        >
          ×
        </button>
      </div>
      {props.boards.length > 1 && (
        <div role="tablist" aria-label="Boards" className="tabs">
          {props.boards.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      {board && rows && rows.length > 0 && (
        <table className="board">
          <caption>
            {props.title} — {board.label}, this device
          </caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Initials</th>
              <th scope="col">{board.label}</th>
              <th scope="col">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.rank}-${r.id}`}
                className={props.newIds.has(r.id) ? 'is-new' : undefined}
              >
                <td>{r.rank}</td>
                <td>
                  {r.initials}
                  {props.newIds.has(r.id) ? ' (new)' : ''}
                </td>
                <td>{formatValue(board.format, r.value)}</td>
                <td>
                  <time dateTime={r.achievedAt}>{formatDate(r.achievedAt)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows && rows.length === 0 && <p>No scores yet. Finish a game to get on the board.</p>}
      <p className="muted">Scores are stored on this device only.</p>
    </dialog>
  );
}

/** non-modal banner; never takes focus; the entry is already stored with the prefilled initials. */
export function InitialsPrompt(props: {
  text: string;
  defaultInitials: string;
  onSave: (initials: string) => void;
  onDismiss: () => void;
}) {
  const [value, setValue] = useState(props.defaultInitials);
  const valid = /^[A-Z0-9]{3}$/.test(value);
  return (
    <section className="initials" role="region" aria-label="New high score">
      <p>{props.text}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) props.onSave(value);
        }}
      >
        <label>
          Initials
          <input
            value={value}
            maxLength={3}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) =>
              setValue(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, 3),
              )
            }
          />
        </label>
        <button type="submit" disabled={!valid}>
          Save
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Dismiss"
          onClick={props.onDismiss}
        >
          ×
        </button>
      </form>
    </section>
  );
}

export function Toast({ text }: { text: ReactNode }) {
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}
