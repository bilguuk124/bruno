import React, { useCallback, useEffect, useState } from 'react';
import { IconArrowBackUp, IconGitCommit } from '@tabler/icons';
import toast from 'react-hot-toast';
import transport from 'transport';
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

// A backend snapshot promotes method/url to columns; the diff wants them on the
// request object alongside the rest of the spec.
const toDiffData = (snapshot) => {
  const spec = snapshot && typeof snapshot.spec === 'object' ? snapshot.spec : {};
  return {
    request: {
      ...spec,
      method: snapshot?.method ?? spec.method ?? 'GET',
      url: snapshot?.url ?? spec.url ?? ''
    }
  };
};

const versionLabel = (v) => `v${v.revision ?? '?'} · ${relativeTime(v.occurredAt)}`;

/**
 * The edit history of a team request, read from the backend change feed. Select
 * one version to diff it against the current request (and restore it), or two
 * versions to diff them against each other.
 */
const RequestVersions = ({ item }) => {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]); // seqs, newest-clicked last, max 2
  const [confirmSeq, setConfirmSeq] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const reload = useCallback(() => {
    transport.backend
      .getRequestHistory(item.uid, { limit: 50 })
      .then((res) => {
        setVersions(res.versions || []);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load version history'));
  }, [item.uid]);

  // item.revision changes when a teammate edits, or after our own restore lands
  // over the change feed — refresh the list either way.
  useEffect(() => {
    reload();
  }, [reload, item.revision]);

  const toggle = (seq) => {
    setConfirmSeq(null);
    setSelected((cur) => {
      if (cur.includes(seq)) return cur.filter((s) => s !== seq);
      if (cur.length < 2) return [...cur, seq];
      return [cur[1], seq];
    });
  };

  const snapshotOf = (seq) => versions.find((v) => v.seq === seq)?.snapshot;

  const restore = (seq) => {
    setRestoring(true);
    transport.backend
      .restoreRequestVersion(item.uid, seq, item.revision)
      .then(() => {
        toast.success('Request restored to that version');
        setSelected([]);
        setConfirmSeq(null);
      })
      .catch((err) => {
        toast.error(
          err.isRevisionConflict
            ? 'This request changed since you opened it — reopen it and try again'
            : err.message || 'Could not restore'
        );
      })
      .finally(() => setRestoring(false));
  };

  if (error) return <StyledWrapper><div className="msg error-text">{error}</div></StyledWrapper>;
  if (!versions) return <StyledWrapper><div className="msg muted">Loading version history…</div></StyledWrapper>;
  if (versions.length === 0) {
    return <StyledWrapper><div className="msg muted">No recorded versions yet — edits will appear here.</div></StyledWrapper>;
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
        leftLabel={versionLabel(versions.find((v) => v.seq === older))}
        rightLabel={versionLabel(versions.find((v) => v.seq === newer))}
      />
    );
  } else if (selected.length === 1) {
    diff = (
      <EndpointVisualDiff
        oldData={toDiffData(snapshotOf(a))}
        newData={{ request: item.draft?.request || item.request }}
        leftLabel={versionLabel(versions.find((v) => v.seq === a))}
        rightLabel="Current"
      />
    );
  }

  return (
    <StyledWrapper>
      <div className="hint muted">
        {selected.length === 0 && 'Select a version to compare it with the current request, or two to compare them.'}
        {selected.length === 1 && 'Comparing with the current request.'}
        {selected.length === 2 && 'Comparing the two selected versions.'}
      </div>

      <ul className="versions">
        {versions.map((v) => {
          const isSelected = selected.includes(v.seq);
          const canRestore = selected.length === 1 && selected[0] === v.seq && v.op !== 'delete';
          return (
            <li key={v.seq} className={isSelected ? 'selected' : ''}>
              <button className="row" onClick={() => toggle(v.seq)}>
                <IconGitCommit size={14} strokeWidth={1.5} className="commit-icon" />
                <span className="rev">v{v.revision ?? '?'}</span>
                <span className="op">{v.op}</span>
                <span className="who">{v.actorName || 'unknown'}</span>
                <span className="when">{relativeTime(v.occurredAt)}</span>
              </button>
              {canRestore && (
                <div className="restore">
                  {confirmSeq === v.seq ? (
                    <>
                      <Button size="xs" disabled={restoring} onClick={() => restore(v.seq)}>
                        {restoring ? 'Restoring…' : 'Confirm restore'}
                      </Button>
                      <button className="link-button" onClick={() => setConfirmSeq(null)}>Cancel</button>
                    </>
                  ) : (
                    <Button
                      size="xs"
                      color="secondary"
                      variant="outline"
                      icon={<IconArrowBackUp size={13} strokeWidth={1.5} />}
                      onClick={() => setConfirmSeq(v.seq)}
                    >
                      Restore this version
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

export default RequestVersions;
