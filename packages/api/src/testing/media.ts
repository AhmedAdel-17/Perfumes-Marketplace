/**
 * A photograph store for tests — the local-disk adapter in a fresh temporary
 * directory.
 *
 * Test support, deliberately NOT exported from the package: a production
 * import of this would be a store in the OS temp directory, which is the kind
 * of mistake that works on a laptop and loses files on a server.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localMediaStore } from '../providers/media';

export function testMediaStore() {
  return localMediaStore({
    root: mkdtempSync(join(tmpdir(), 'diyar-test-media-')),
    publicBaseUrl: 'http://localhost:3100/dev-media',
    secret: 'test-media-secret',
  });
}
