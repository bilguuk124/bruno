import { useCallback, useEffect, useState } from 'react';
import { IconArrowBackUp, IconGitCommit } from '@tabler/icons';
import toast from 'react-hot-toast';
import Button from 'ui/Button';
import EndpointVisualDiff from 'components/OpenAPISyncTab/EndpointChangeSection/EndpointVisualDiff';
import StyledWrapper from './StyledWrapper';

const relativeTime = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

/**
 * "3 edits over 4m" — a version is a sitting of edits, so a single save says
 * nothing extra and a long one is worth describing.
 */
export const editSummary = (version) => {
  const edits = version.edits || 1;
  if (edits <= 1) return null;
  const spanSeconds = version.startedAt
    ? Math.round((new Date(version.occurredAt).getTime() - new Date(version.startedAt).getTime()) / 1000)
    : 0;
  if (spanSeconds < 60) return `${edits} edits`;
  const minutes = Math.round(spanSeconds / 60);
  return `${edits} edits over ${minutes}m`;
};

const versionLabel = (v) => (v ? `v${v.revision ?? '?'} · ${relativeTime(v.occurredAt)}` : '');

/**
 * The version history of one team entity: a timeline of past versions, a visual
 * diff of any one against the current state (or of two against each other), and
 * a two-step restore.
 *
 * Entity-agnostic on purpose — requests, folders and collections all version the
 * same way on the backend, and a reader shouldn't have to learn three timelines.
 * Callers supply the three things that genuinely differ:
 *
 *   loadHistory  (limit) => Promise<{ versions }>
 *   restore      (seq, revision) => Promise
 *   toDiffData   (snapshot) => the shape EndpointVisualDiff renders
 *
 * `currentDiffData` is the live state to compare a single selection against;
 * `reloadKey` should be the entity's revision, so the list refreshes both when
 * a teammate edits and after our own restore lands over the change feed.
 */
const VersionsPanel = ({
  loadHistory,
  restore,
  toDiffData,
  currentDiffData,
  reloadKey,
  emptyHint = 'No recorded versions yet — edits will appear here.',
  restoreLabel = 'Restore this version',
  restoredMessage = 'Restored to that version',
  conflictMessage = 'This changed since you opened it — reopen it and try again'
}) => {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]); // seqs, newest-clicked last, max 2
  const [confirmSeq, setConfirmSeq] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const reload = useCallback(() => {
    loadHistory(50)
      .then((res) => {
        setVersions(res.versions || []);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load version history'));
  }, [loadHistory]);

  useEffect(() => {
    reload();
  }, [reload, reloadKey]);

  const toggle = (seq) => {
    setConfirmSeq(null);
    setSelected((cur) => {
      if (cur.includes(seq)) return cur.filter((s) => s !== seq);
      if (cur.length < 2) return [...cur, seq];
      return [cur[1], seq];
    });
  };

  const versionAt = (seq) => versions.find((v) => v.seq === seq);
  const snapshotOf = (seq) => versionAt(seq)?.snapshot;

  const handleRestore = (seq) => {
    setRestoring(true);
    restore(seq)
      .then(() => {
        toast.success(restoredMessage);
        setSelected([]);
        setConfirmSeq(null);
      })
      .catch((err) => {
        toast.error(err.isRevisionConflict ? conflictMessage : err.message || 'Could not restore');
      })
      .finally(() => setRestoring(false));
  };

  if (error) {
    return (
      <StyledWrapper>
        <div className="msg error-text">{error}</div>
      </StyledWrapper>
    );
  }
  if (!versions) {
    return (
      <StyledWrapper>
        <div className="msg muted">Loading version history…</div>
      </StyledWrapper>
    );
  }
  if (versions.length === 0) {
    return (
      <StyledWrapper>
        <div className="msg muted">{emptyHint}</div>
      </StyledWrapper>
    );
  }

  const [a, b] = selected;
  let diff = null;
  if (selected.length === 2) {
    const older = a < b ? a : b;
    const newer = a < b ? b : a;
    diff = (
      <EndpointVisualDiff
        oldData={toDiffData(snapshotOf(older))}
        newData={toDiffData(snapshotOf(newer))}
        leftLabel={versionLabel(versionAt(older))}
        rightLabel={versionLabel(versionAt(newer))}
      />
    );
  } else if (selected.length === 1) {
    diff = (
      <EndpointVisualDiff
        oldData={toDiffData(snapshotOf(a))}
        newData={currentDiffData}
        leftLabel={versionLabel(versionAt(a))}
        rightLabel="Current"
      />
    );
  }

  return (
    <StyledWrapper>
      <div className="hint muted">
        {selected.length === 0 && 'Select a version to compare it with the current state, or two to compare them.'}
        {selected.length === 1 && 'Comparing with the current state.'}
        {selected.length === 2 && 'Comparing the two selected versions.'}
      </div>

      <ul className="versions">
        {versions.map((v) => {
          const isSelected = selected.includes(v.seq);
          const canRestore = selected.length === 1 && selected[0] === v.seq && v.op !== 'delete';
          const edits = editSummary(v);
          return (
            <li key={v.seq} className={isSelected ? 'selected' : ''}>
              <button className="row" onClick={() => toggle(v.seq)}>
                <IconGitCommit size={14} strokeWidth={1.5} className="commit-icon" />
                <span className="rev">v{v.revision ?? '?'}</span>
                <span className="op">{v.op}</span>
                <span className="who">{v.actorName || 'unknown'}</span>
                {edits && <span className="edits">{edits}</span>}
                <span className="when">{relativeTime(v.occurredAt)}</span>
              </button>
              {canRestore && (
                <div className="restore">
                  {confirmSeq === v.seq ? (
                    <>
                      <Button size="xs" disabled={restoring} onClick={() => handleRestore(v.seq)}>
                        {restoring ? 'Restoring…' : 'Confirm restore'}
                      </Button>
                      <button className="link-button" onClick={() => setConfirmSeq(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <Button
                      size="xs"
                      color="secondary"
                      variant="outline"
                      icon={<IconArrowBackUp size={13} strokeWidth={1.5} />}
                      onClick={() => setConfirmSeq(v.seq)}
                    >
                      {restoreLabel}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {diff && <div className="diff">{diff}</div>}
    </StyledWrapper>
  );
};

export default VersionsPanel;
