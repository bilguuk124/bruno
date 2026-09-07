import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import Modal from 'components/Modal';
import { createTeamWorkspace } from 'providers/ReduxStore/slices/backend';

/**
 * Create a backend ("team") workspace. The signed-in user becomes its owner and
 * the app switches to it. Team workspaces have no filesystem location — the
 * backend is their store — so this only asks for a name.
 */
const CreateTeamWorkspace = ({ onClose }) => {
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    dispatch(createTeamWorkspace(trimmed))
      .then(() => {
        toast.success('Team workspace created');
        onClose();
      })
      .catch((err) => toast.error(err.message || 'Could not create the workspace'))
      .finally(() => setSubmitting(false));
  };

  return (
    <Modal
      size="sm"
      title="Create Team Workspace"
      confirmText={submitting ? 'Creating…' : 'Create'}
      handleConfirm={handleConfirm}
      handleCancel={onClose}
      confirmDisabled={submitting || !name.trim()}
    >
      <label htmlFor="team-workspace-name" className="block font-semibold mb-2">
        Name
      </label>
      <input
        id="team-workspace-name"
        type="text"
        className="block textbox w-full"
        autoComplete="off"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </Modal>
  );
};

export default CreateTeamWorkspace;
