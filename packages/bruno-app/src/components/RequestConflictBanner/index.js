import React from 'react';
import { useDispatch } from 'react-redux';
import { IconAlertTriangle } from '@tabler/icons';
import Button from 'ui/Button';
import {
  resolveConflictOverwrite,
  resolveConflictTakeTheirs,
  dismissConflict,
  resolveConflictRecreate
} from 'providers/ReduxStore/slices/collections/actions';
import { deleteRequestDraft } from 'providers/ReduxStore/slices/collections';
import { closeTabs } from 'providers/ReduxStore/slices/tabs';
import StyledWrapper from './StyledWrapper';

const relativeTime = (iso) => {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return ' just now';
  if (mins < 60) return ` ${mins}m ago`;
  return ` ${Math.round(mins / 60)}h ago`;
};

/**
 * Shown at the top of the request pane when a team request has an unresolved
 * merge conflict — a 412 on save, a remote edit while editing, or the request
 * being deleted upstream. The user picks how to resolve it.
 */
const RequestConflictBanner = ({ item, collectionUid }) => {
  const dispatch = useDispatch();
  const conflict = item?.conflict;
  if (!conflict) return null;

  if (conflict.kind === 'deleted') {
    return (
      <StyledWrapper>
        <IconAlertTriangle size={16} className="icon" />
        <span className="message">This request was deleted on the server.</span>
        <div className="actions">
          <Button size="xs" onClick={() => dispatch(resolveConflictRecreate(item.uid, collectionUid))}>
            Recreate with my changes
          </Button>
          <Button
            size="xs"
            color="secondary"
            variant="outline"
            onClick={() => {
              dispatch(closeTabs({ tabUids: [item.uid] }));
              dispatch(deleteRequestDraft({ itemUid: item.uid, collectionUid }));
            }}
          >
            Discard
          </Button>
        </div>
      </StyledWrapper>
    );
  }

  const who = conflict.updatedByName ? ` by ${conflict.updatedByName}` : '';
  return (
    <StyledWrapper>
      <IconAlertTriangle size={16} className="icon" />
      <span className="message">
        Changed on the server{who}
        {relativeTime(conflict.at)}. Your unsaved edits are still here.
      </span>
      <div className="actions">
        <Button size="xs" onClick={() => dispatch(resolveConflictOverwrite(item.uid, collectionUid))}>
          Overwrite server
        </Button>
        <Button
          size="xs"
          color="secondary"
          variant="outline"
          onClick={() => dispatch(resolveConflictTakeTheirs(item.uid, collectionUid))}
        >
          Discard mine &amp; reload
        </Button>
        <Button
          size="xs"
          color="secondary"
          variant="ghost"
          onClick={() => dispatch(dismissConflict(item.uid, collectionUid))}
        >
          Keep editing
        </Button>
      </div>
    </StyledWrapper>
  );
};

export default RequestConflictBanner;
