// @vitest-environment node

import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { execSetupCommandDefault } from '@/infrastructure/services/agents/dev-server-agent/nodes/install-deps.node.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

describe('setup command output', () => {
  it('preserves split UTF-8 on independent streams and flushes the final error line', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
    const lines: string[] = [];
    const result = execSetupCommandDefault('make setup', process.cwd(), (line) => lines.push(line));
    const output = Buffer.from('Préparé 🎉\n');
    const error = Buffer.from('Échec 日本語');
    for (let i = 0; i < Math.max(output.length, error.length); i++) {
      if (i < output.length) child.stdout.emit('data', output.subarray(i, i + 1));
      if (i < error.length) child.stderr.emit('data', error.subarray(i, i + 1));
    }
    child.emit('close', 1);

    expect(await result).toEqual({ success: false, tail: ['Préparé 🎉', 'Échec 日本語'] });
    expect(lines).toEqual(['Préparé 🎉', 'Échec 日本語']);
  });
});
