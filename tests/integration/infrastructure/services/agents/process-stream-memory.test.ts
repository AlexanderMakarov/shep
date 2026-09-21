import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('agent output memory bounds', () => {
  it('discards continued oversized output without retaining it and recovers at a newline', () => {
    const moduleUrl = new URL(
      '../../../../../packages/core/src/infrastructure/services/agents/common/executors/process-stream.ts',
      import.meta.url
    ).href;
    // An isolated heap and explicit collection measure retained memory rather
    // than allocation noise from other suites. Feed 32 MiB after overflowing a
    // 1 KiB line limit; retaining that tail must fail the generous 8 MiB bound.
    const script = `
      import { createLineAccumulator } from ${JSON.stringify(moduleUrl)};
      const lines = [];
      let overflows = 0;
      const accumulator = createLineAccumulator(line => lines.push(line), {
        maxLineBytes: 1024,
        onOverflow: () => { overflows += 1; },
      });
      const chunk = Buffer.alloc(512 * 1024, 'x');
      accumulator.push(chunk);
      global.gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 64; i += 1) accumulator.push(chunk);
      global.gc();
      const retained = process.memoryUsage().heapUsed - before;
      accumulator.push('\\nrecovered\\n');
      accumulator.flush();
      process.stdout.write(JSON.stringify({ retained, lines, overflows }));
    `;
    const output = execFileSync(
      process.execPath,
      [
        '--expose-gc',
        '--max-old-space-size=256',
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        script,
      ],
      { encoding: 'utf8', timeout: 20_000 }
    );
    const result = JSON.parse(output) as { retained: number; lines: string[]; overflows: number };

    expect(result.retained).toBeLessThan(8 * 1024 * 1024);
    expect(result.lines).toEqual(['recovered']);
    expect(result.overflows).toBe(1);
  }, 25_000);
});
