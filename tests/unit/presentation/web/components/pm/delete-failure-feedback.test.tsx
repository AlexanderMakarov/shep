/**
 * Delete-failure feedback for the PM panels.
 *
 * Every one of these panels used to run `if (!result.error) { removeFromList() }`
 * with NO else branch, so a rejected delete (permission denied, row in use,
 * daemon down) left the row on screen and told the user nothing at all.
 * Each test below drives the panel's delete button with a server action that
 * answers `{ error }` and asserts the error reaches a toast.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CycleStatus,
  ModuleStatus,
  EpicStatus,
  type Cycle,
  type PmModule,
  type Epic,
  type PmAttachment,
  type TimeEntry,
  type Page,
} from '@shepai/core/domain/generated/output';

import { CyclePanel } from '@/components/pm/cycle-panel/cycle-panel';
import { ModulePanel } from '@/components/pm/module-panel/module-panel';
import { EpicPanel } from '@/components/pm/epic-panel/epic-panel';
import { AttachmentList } from '@/components/pm/attachments/attachment-list';
import { TimeEntryList } from '@/components/pm/time-entries/time-entry-list';
import { PagesPanel } from '@/components/pm/page-editor/pages-panel';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const deleteCycle = vi.fn();
const deleteModule = vi.fn();
const deleteEpic = vi.fn();
const deleteAttachment = vi.fn();
const deleteTimeEntry = vi.fn();
const deletePage = vi.fn();

vi.mock('@/app/actions/manage-cycles', () => ({
  createCycle: vi.fn(),
  updateCycle: vi.fn(),
  deleteCycle: (...args: unknown[]) => deleteCycle(...args),
  transferCycleItems: vi.fn(),
}));
vi.mock('@/app/actions/manage-modules', () => ({
  createModule: vi.fn(),
  deleteModule: (...args: unknown[]) => deleteModule(...args),
}));
vi.mock('@/app/actions/manage-epics', () => ({
  createEpic: vi.fn(),
  updateEpic: vi.fn(),
  deleteEpic: (...args: unknown[]) => deleteEpic(...args),
}));
vi.mock('@/app/actions/manage-attachments', () => ({
  deleteAttachment: (...args: unknown[]) => deleteAttachment(...args),
}));
vi.mock('@/app/actions/manage-time-entries', () => ({
  logTimeEntry: vi.fn(),
  deleteTimeEntry: (...args: unknown[]) => deleteTimeEntry(...args),
}));
vi.mock('@/app/actions/manage-pages', () => ({
  createPage: vi.fn(),
  updatePage: vi.fn(),
  deletePage: (...args: unknown[]) => deletePage(...args),
}));

// The pages panel lazy-loads the Tiptap editor; the editor itself is
// irrelevant here and pulls in a large dependency chain.
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

const NOW = new Date('2026-01-01T00:00:00Z');

const cycle: Cycle = {
  id: 'c1',
  projectId: 'p1',
  name: 'Sprint 1',
  status: CycleStatus.Active,
  createdAt: NOW,
  updatedAt: NOW,
};

const pmModule: PmModule = {
  id: 'm1',
  projectId: 'p1',
  name: 'Authentication',
  status: ModuleStatus.InProgress,
  createdAt: NOW,
  updatedAt: NOW,
};

const epic: Epic = {
  id: 'e1',
  projectId: 'p1',
  name: 'Billing',
  status: EpicStatus.InProgress,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: undefined,
};

const attachment: PmAttachment = {
  id: 'att-1',
  workItemId: 'wi-1',
  filename: 'screenshot.png',
  mimeType: 'image/png',
  fileSize: 2048,
  storagePath: '/tmp/screenshot.png',
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: undefined,
};

const timeEntry: TimeEntry = {
  id: 'te-1',
  workItemId: 'wi-1',
  durationMinutes: 90,
  note: 'Pairing',
  loggedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

const page: Page = {
  id: 'page-1',
  projectId: 'p1',
  title: 'Architecture',
  content: '',
  sortOrder: 0,
  isFavorite: false,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('PM panels surface delete failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CyclePanel toasts the error and keeps the cycle when the delete fails', async () => {
    deleteCycle.mockResolvedValue({ error: 'Cycle has open work items' });
    const onCyclesChange = vi.fn();

    render(<CyclePanel projectId="p1" cycles={[cycle]} onCyclesChange={onCyclesChange} />);
    await userEvent.click(screen.getByTestId('delete-cycle-c1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Cycle has open work items');
    expect(onCyclesChange).not.toHaveBeenCalled();
  });

  it('ModulePanel toasts the error and keeps the module when the delete fails', async () => {
    deleteModule.mockResolvedValue({ error: 'Module is referenced by 3 work items' });
    const onModulesChange = vi.fn();

    render(<ModulePanel projectId="p1" modules={[pmModule]} onModulesChange={onModulesChange} />);
    await userEvent.click(screen.getByTestId('delete-module-m1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Module is referenced by 3 work items');
    expect(onModulesChange).not.toHaveBeenCalled();
  });

  it('EpicPanel toasts the error and keeps the epic when the delete fails', async () => {
    deleteEpic.mockResolvedValue({ error: 'Epic still has children' });
    const onEpicsChange = vi.fn();

    render(<EpicPanel projectId="p1" epics={[epic]} onEpicsChange={onEpicsChange} />);
    await userEvent.click(screen.getByTestId('delete-epic-e1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Epic still has children');
    expect(onEpicsChange).not.toHaveBeenCalled();
  });

  it('AttachmentList toasts the error and keeps the attachment when the delete fails', async () => {
    deleteAttachment.mockResolvedValue({ error: 'File is locked' });

    render(<AttachmentList workItemId="wi-1" attachments={[attachment]} />);
    await userEvent.click(screen.getByTestId('delete-attachment-att-1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('File is locked');
    expect(screen.getByTestId('attachment-att-1')).toBeInTheDocument();
  });

  it('TimeEntryList toasts the error and keeps the entry and total when the delete fails', async () => {
    deleteTimeEntry.mockResolvedValue({ error: 'Entry already invoiced' });

    render(<TimeEntryList workItemId="wi-1" timeEntries={[timeEntry]} totalMinutes={90} />);
    await userEvent.click(screen.getByTestId('delete-time-entry-te-1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Entry already invoiced');
    expect(screen.getByText(/1h 30m total/)).toBeInTheDocument();
  });

  it('PagesPanel toasts the error and keeps the page when the delete fails', async () => {
    deletePage.mockResolvedValue({ error: 'Page has sub-pages' });

    render(<PagesPanel projectId="p1" pages={[page]} />);
    await userEvent.click(screen.getByTestId('delete-page-page-1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('Page has sub-pages');
    expect(screen.getByTestId('page-item-page-1')).toBeInTheDocument();
  });
});
