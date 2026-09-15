/**
 * Sending an image to the media store from the browser.
 *
 * Shared by the two screens that upload — a house's product photographs and an
 * operator's editorial images — so the courtesy checks, the progress reporting
 * and the sentences a person reads are the same on both. Written once in the
 * photograph manager first; lifted here when the second caller arrived rather
 * than copied into it.
 *
 * Nothing here is a control. The server reads the bytes that arrive and decides
 * for itself; these checks exist so a person on a phone connection is not made
 * to upload 9 MB that was always going to be refused.
 *
 * No `'use client'` directive: it has no hooks and exports functions, and a
 * client component that imports it makes it client code.
 */
import { IMAGE_TYPES, MEDIA_LIMITS } from '@diyar/domain';

/** PUT the file to the signed URL, reporting progress. `fetch` cannot report upload progress. */
export function sendFile(
  url: string,
  headers: Readonly<Record<string, string>>,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => (request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(String(request.status))));
    request.onerror = () => reject(new Error('network'));
    request.send(file);
  });
}

/** The displayed dimensions — browsers apply EXIF orientation to `naturalWidth`. */
export async function dimensionsOf(file: File): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Why this file should not be sent, as the sentence to show — or null.
 *
 * The first reason only, unlike the server's refusals: these are checked in the
 * order a person fixes them, and a file of the wrong type has no dimensions
 * worth reporting.
 */
export async function reasonNotToSend(file: File): Promise<string | null> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'استخدم صورة بصيغة JPG أو PNG أو WebP.';
  }
  if (file.size > MEDIA_LIMITS.maxBytes) {
    return 'الصورة أكبر من 10 ميجابايت. صدّرها بجودة أقل قليلًا.';
  }
  const size = await dimensionsOf(file);
  if (size && Math.min(size.width, size.height) < MEDIA_LIMITS.minEdge) {
    return 'الصورة صغيرة جدًا وستبدو غير واضحة. يجب ألا يقل ضلعها الأقصر عن 800 بكسل.';
  }
  return null;
}

/** The sentence for an upload that did not complete. */
export const INTERRUPTED_UPLOAD = 'انقطع الرفع قبل أن يكتمل. تحقّق من الاتصال وحاول مرّة أخرى.';
