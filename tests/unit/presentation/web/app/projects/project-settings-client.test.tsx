/**
 * Failure feedback on the project settings page.
 *
 * Every mutating handler on this page checked only the happy path
 * (`if (result.state)` / `if (!result.error)`) and had no else branch, so a
 * rejected save, add or delete was completely silent. The worst case is
 * Delete Project: the user types the project name to confirm, clicks, and
 * — when the delete fails — nothing happens and nothing is said.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EstimateType,
  StateGroup,
  type PmProject,
  type WorkItemState,
  type Label,
} from '@shepai/core/domain/generated/output';
import { ProjectSettingsClient } from '@/app/projects/[slug]/settings/project-settings-client';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const updatePmProject = vi.fn();
const deletePmProject = vi.fn();
const createWorkItemState = vi.fn();
const deleteWorkItemState = vi.fn();
const createLabel = vi.fn();
const deleteLabel = vi.fn();

vi.mock('@/app/actions/update-pm-project', () => ({
  updatePmProject: (...args: unknown[]) => updatePmProject(...args),
}));
vi.mock('@/app/actions/delete-pm-project', () => ({
  deletePmProject: (...args: unknown[]) => deletePmProject(...args),
}));
vi.mock('@/app/actions/manage-work-item-states', () => ({
  createWorkItemState: (...args: unknown[]) => createWorkItemState(...args),
  deleteWorkItemState: (...args: unknown[]) => deleteWorkItemState(...args),
}));
vi.mock('@/app/actions/manage-labels', () => ({
  createLabel: (...args: unknown[]) => createLabel(...args),
  deleteLabel: (...args: unknown[]) => deleteLabel(...args),
}));
vi.mock('@/app/actions/add-project-member', () => ({ addProjectMember: vi.fn() }));
vi.mock('@/app/actions/remove-project-member', () => ({ removeProjectMember: vi.fn() }));
vi.mock('@/app/actions/update-project-member-role', () => ({ updateProjectMemberRole: vi.fn() }));

vi.mock('@/components/pm/estimate-settings/estimate-settings', () => ({
  EstimateSettings: () => <div data-testid="estimate-settings-stub" />,
}));
vi.mock('@/components/features/projects/project-members-panel', () => ({
  ProjectMembersPanel: () => <div data-testid="members-panel-stub" />,
}));

const NOW = new Date('2026-01-01T00:00:00Z');

const project: PmProject = {
  id: 'proj-1',
  name: 'Apollo',
  slug: 'apollo',
  identifierPrefix: 'APO',
  workItemCounter: 0,
  estimateType: EstimateType.Points,
  createdAt: NOW,
  updatedAt: NOW,
};

const state: WorkItemState = {
  id: 'state-1',
  projectId: 'proj-1',
  name: 'In Review',
  color: '#6366f1',
  displayOrder: 0,
  stateGroup: StateGroup.Started,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const label: Label = {
  id: 'label-1',
  projectId: 'proj-1',
  name: 'bug',
  color: '#ef4444',
  createdAt: NOW,
  updatedAt: NOW,
};

function renderSettings() {
  return render(<ProjectSettingsClient project={project} states={[state]} labels={[label]} />);
}

describe('ProjectSettingsClient surfaces failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toasts when deleting a work item state fails and keeps the state', async () => {
    deleteWorkItemState.mockResolvedValue({ error: 'State is in use by 4 work items' });

    renderSettings();
    await userEvent.click(screen.getByTestId('delete-state-state-1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('State is in use by 4 work items');
    expect(screen.getByText('In Review')).toBeInTheDocument();
  });

  it('toasts when deleting a label fails and keeps the label', async () => {
    deleteLabel.mockResolvedValue({ error: 'Label is attached to work items' });

    renderSettings();
    await userEvent.click(screen.getByTestId('delete-label-label-1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Label is attached to work items');
    expect(screen.getByText('bug')).toBeInTheDocument();
  });

  it('toasts when adding a label fails', async () => {
    createLabel.mockResolvedValue({ error: 'A label named "urgent" already exists' });

    renderSettings();
    await userEvent.type(screen.getByTestId('new-label-input'), 'urgent');
    await userEvent.click(screen.getByTestId('add-label-btn'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('already exists');
  });

  it('toasts when adding a work item state fails', async () => {
    createWorkItemState.mockResolvedValue({ error: 'State limit reached' });

    renderSettings();
    await userEvent.type(screen.getByTestId('new-state-input'), 'QA');
    await userEvent.click(screen.getByTestId('add-state-btn'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('State limit reached');
  });

  it('toasts when saving general settings fails', async () => {
    updatePmProject.mockResolvedValue({ error: 'Slug already taken' });

    renderSettings();
    await userEvent.click(screen.getByTestId('save-general-btn'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Slug already taken');
  });

  it('toasts when Delete Project fails and does NOT navigate away', async () => {
    deletePmProject.mockResolvedValue({ error: 'Project has active cycles' });

    renderSettings();
    await userEvent.type(screen.getByTestId('delete-confirm-input'), 'Apollo');
    await userEvent.click(screen.getByTestId('delete-project-btn'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Project has active cycles');
    expect(push).not.toHaveBeenCalled();
  });

  it('still navigates to /projects when Delete Project succeeds', async () => {
    deletePmProject.mockResolvedValue({});

    renderSettings();
    await userEvent.type(screen.getByTestId('delete-confirm-input'), 'Apollo');
    await userEvent.click(screen.getByTestId('delete-project-btn'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects'));
    expect(toastError).not.toHaveBeenCalled();
  });
});
