import 'server-only';

/** Feature-toggle strategy: a visual-only local experiment, never a production override. */
export function isArtDirectionPreview(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.DIYAR_ART_DIRECTION === 'true';
}
