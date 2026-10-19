/**
 * Lifting a bottle out of its photograph, off the main thread.
 *
 * `makeRelief` is a second or two of arithmetic on a million and a half
 * pixels; run on the page, the console would freeze while it worked. Here it
 * runs beside it, and hands the two images back as transferable buffers, so
 * nothing is copied on the way out.
 */
import { makeRelief, type ReliefInput } from '@diyar/domain';

interface Job {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayBuffer;
  readonly input: ReliefInput;
}

self.onmessage = (event: MessageEvent<Job>) => {
  const { width, height, data, input } = event.data;
  try {
    const result = makeRelief({ width, height, data: new Uint8ClampedArray(data) }, input);
    if (!result.ok) {
      self.postMessage(result);
      return;
    }
    const cutout = result.cutout.data.buffer as ArrayBuffer;
    const relief = result.relief.data.buffer as ArrayBuffer;
    (self as unknown as Worker).postMessage({
      ok: true,
      width: result.cutout.width,
      height: result.cutout.height,
      cutout,
      relief,
      placement: result.placement,
    }, [cutout, relief]);
  } catch (error) {
    self.postMessage({ ok: false, failed: error instanceof Error ? error.message : String(error) });
  }
};
