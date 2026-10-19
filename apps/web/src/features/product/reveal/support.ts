/**
 * Whether this browser can draw the bottle at all — asked before the reveal's
 * control is shown, so a visitor is never offered something that cannot open.
 *
 * Its own small module: the page imports this on load, and must not pull the
 * renderer in with it — the renderer loads when the reveal is opened.
 */
export function canRenderBottle(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) return false;
    // Vertex texture fetch is how the relief map moves the mesh; a GPU without it would draw a flat card.
    const ok = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}
