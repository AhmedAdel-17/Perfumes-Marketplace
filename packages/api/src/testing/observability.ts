import type { Observability } from '../trpc';
import type { LogLevel } from '../observability/log';

/**
 * Observability for a test context: a fixed request id, and every log line and
 * every reported error kept in arrays the test can read.
 *
 * Kept rather than discarded, because the claims P1.4.3 makes are about what
 * gets WRITTEN — a request id on the line, no phone on the line — and a test
 * that threw the lines away could only ever prove that nothing crashed.
 */
export function testObservability(requestId = '00000000-0000-4000-8000-000000000001') {
  const lines: Array<{ level: LogLevel; entry: Record<string, unknown> }> = [];
  const reported: Array<{ error: unknown; requestId: string; path?: string }> = [];

  const observability: Observability = {
    requestId: async () => requestId,
    sink: (line, level) => { lines.push({ level, entry: JSON.parse(line) }); },
    errors: {
      name: 'test-errors',
      isStub: true,
      capture: (error, context) => {
        reported.push({ error, requestId: context.requestId, ...(context.path ? { path: context.path } : {}) });
      },
    },
  };

  return { observability, lines, reported, requestId };
}
