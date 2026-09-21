/**
 * `shep logs` — the worker/daemon log surface.
 *
 * Today it carries `prune`; `shep feat logs` and `shep agent logs` remain
 * the way to read a single run's output.
 */

import { Command } from 'commander';

import { createLogsPruneCommand } from './prune.command.js';

export function createLogsCommand(): Command {
  const command = new Command('logs').description('Inspect and prune Shep log files');
  command.addCommand(createLogsPruneCommand());
  return command;
}
