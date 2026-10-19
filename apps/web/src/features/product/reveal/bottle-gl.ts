/**
 * The bottle as an object: its relief (cut-out + relief map, `makeRelief` in
 * the domain) drawn as a relit 2.5D mesh, with its reflection on a polished
 * floor (Le Dévoilement, 19 Oct 2026).
 *
 * Plain WebGL 1, no library — this file is the whole renderer, a few
 * kilobytes, which is the case for not adding Three.js (CLAUDE.md §13: no new
 * dependency without a reason that outweighs it, and this effect does not
 * need a scene graph). Loaded only when a visitor opens the reveal.
 *
 * HOW IT DRAWS. A grid of vertices, displaced toward the camera by the relief
 * map, textured by the cut-out. The fragment shader rebuilds each pixel's
 * normal from the relief map and adds a light the visitor moves: a broad
 * diffuse term (the photograph keeps its own light — this only adds the
 * room's), a tight specular, a rim on the bevels, and a sheen that travels
 * across the glass. `relight` 0 is the photograph exactly as taken, and
 * `depth` 0 is a flat picture: the two start at 0 so the object can lie over
 * its own photograph without a seam, and rise to 1 as it stands up.
 */

const VERT = `
attribute vec2 aUv;
uniform sampler2D uHeight;
uniform mat4 uMvp;
uniform vec2 uSize;
uniform float uDepth;
uniform float uMirror;
varying vec2 vUv;
void main() {
  vUv = aUv;
  float h = texture2D(uHeight, aUv).r;
  vec3 p = vec3((aUv.x - 0.5) * uSize.x, (0.5 - aUv.y) * uSize.y, h * uDepth);
  // The reflection: the same bottle mirrored in the floor its foot stands on.
  if (uMirror > 0.5) { p.y = -uSize.y - p.y; }
  gl_Position = uMvp * vec4(p, 1.0);
}`;

const FRAG = `
precision highp float;
uniform sampler2D uCut;
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform vec3 uLight;
uniform float uSweep;
uniform float uMirror;
uniform float uOpacity;
uniform float uRelight;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uCut, vUv);
  if (c.a < 0.01) discard;
  // A wide stencil: an 8-bit relief map steps, and a narrow one draws the steps.
  vec2 o = uTexel * 2.5;
  float hl = texture2D(uHeight, vUv - vec2(o.x, 0.0)).r;
  float hr = texture2D(uHeight, vUv + vec2(o.x, 0.0)).r;
  float hu = texture2D(uHeight, vUv - vec2(0.0, o.y)).r;
  float hd = texture2D(uHeight, vUv + vec2(0.0, o.y)).r;
  vec3 n = normalize(vec3((hl - hr) * 3.6, (hd - hu) * 3.6, 1.0));
  vec3 l = normalize(uLight);
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  float diffuse = 0.84 + 0.16 * max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, h), 0.0), 64.0) * 0.9;
  float rim = pow(1.0 - n.z, 1.7) * 0.32;
  float band = vUv.x * 0.8 + vUv.y * 0.5 - uSweep;
  float sheen = smoothstep(0.12, 0.0, abs(band)) * 0.2;
  // Warm light, as a tungsten spot: never a screen's blue-white.
  vec3 lit = c.rgb * diffuse + (spec + rim + sheen) * vec3(1.0, 0.97, 0.92);
  vec3 colour = mix(c.rgb, lit, uRelight);
  float a = c.a * uOpacity;
  if (uMirror > 0.5) { a *= 0.13 * smoothstep(0.55, 1.0, vUv.y); }
  gl_FragColor = vec4(colour * a, a);
}`;

type Mat4 = Float32Array;

const mul = (a: Mat4, b: Mat4): Mat4 => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
  }
  return o;
};
const perspective = (fovy: number, aspect: number, near: number, far: number): Mat4 => {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
};
const translate = (x: number, y: number, z: number): Mat4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const rotX = (a: number): Mat4 => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotY = (a: number): Mat4 => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const rotZ = (a: number): Mat4 => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
const scale = (k: number): Mat4 => new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]);

/**
 * The camera: 3.9 units back, a 30° lens. At that distance one world unit is
 * `height / (2 · 3.9 · tan 15°)` CSS pixels — which is what lets the object be
 * laid exactly over a photograph on the page.
 */
const CAMERA = 3.9;
const FOV = Math.PI / 6;

export interface Placement {
  readonly centreX: number;
  readonly centreY: number;
  readonly height: number;
  readonly angle: number;
}

/** Where the bottle stands and how it is lit, this frame. Every field is set by the stage. */
export interface BottleState {
  x: number; y: number; scale: number;
  rx: number; ry: number; rz: number; lift: number;
  opacity: number; reflect: number; relight: number; depth: number;
  light: [number, number, number];
  sweep: number;
}

export interface Pose { x: number; y: number; scale: number; rz: number }

export interface Rect { left: number; top: number; width: number; height: number }

const UNIFORMS = ['uHeight', 'uCut', 'uMvp', 'uSize', 'uDepth', 'uMirror', 'uTexel', 'uLight', 'uSweep', 'uOpacity', 'uRelight'] as const;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('could not create a shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(shader) || (gl.isContextLost() ? 'context lost' : 'unknown')}`);
  return shader;
}

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  // The store may be another origin (R2); a texture must not taint the canvas.
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`could not load ${url}`));
  image.src = url;
});

export class BottleGL {
  readonly state: BottleState = {
    x: 0, y: 0.06, scale: 1, rx: 0, ry: 0, rz: 0, lift: 0,
    opacity: 1, reflect: 1, relight: 1, depth: 1, light: [0.4, 0.5, 1], sweep: -1,
  };
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly loc: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private readonly aUv: number;
  private cutTex: WebGLTexture | null = null;
  private heightTex: WebGLTexture | null = null;
  private uvBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private count = 0;
  private aspect = 1;
  private texel: [number, number] = [1, 1];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    const program = gl.createProgram();
    if (!program) throw new Error('could not create a program');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    this.program = program;
    this.loc = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])) as BottleGL['loc'];
    this.aUv = gl.getAttribLocation(program, 'aUv');
  }

  get ready(): boolean { return this.count > 0; }

  /** The cut-out's width over its height — known once it has loaded. */
  get shape(): number { return this.aspect; }

  async load(cutoutUrl: string, reliefUrl: string): Promise<void> {
    const gl = this.gl;
    const [cut, height] = await Promise.all([loadImage(cutoutUrl), loadImage(reliefUrl)]);
    const texture = (image: HTMLImageElement, unit: number): WebGLTexture => {
      const t = gl.createTexture();
      if (!t) throw new Error('could not create a texture');
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.cutTex = texture(cut, 0);
    this.heightTex = texture(height, 1);
    this.aspect = cut.width / cut.height;
    this.texel = [1 / height.width, 1 / height.height];

    // A grid dense enough for the rounded edges to read; within 16-bit indices.
    const cols = 140, rows = Math.min(400, Math.round(140 / this.aspect));
    const uv: number[] = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) uv.push(c / cols, r / rows);
    const index: number[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * (cols + 1) + c;
      index.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
    }
    this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
    this.count = index.length;
  }

  /** CSS pixels per world unit, on the plane the bottle stands in. */
  private pixelsPerUnit(): number {
    return this.canvas.clientHeight / (2 * CAMERA * Math.tan(FOV / 2));
  }

  /**
   * The pose that lays the cut-out exactly over the bottle in its photograph,
   * where the photograph is drawn at `rect` (viewport pixels, the whole image).
   */
  poseOver(rect: Rect, placement: Placement): Pose {
    const c = this.canvas.getBoundingClientRect();
    const ppu = this.pixelsPerUnit();
    const sx = rect.left + placement.centreX * rect.width - c.left;
    const sy = rect.top + placement.centreY * rect.height - c.top;
    return {
      x: (sx - c.width / 2) / ppu,
      y: (c.height / 2 - sy) / ppu,
      scale: (placement.height * rect.height) / ppu,
      rz: (placement.angle * Math.PI) / 180,
    };
  }

  /** Upright, `heightPx` tall, centred on a viewport point. */
  poseStanding(viewportX: number, viewportY: number, heightPx: number): Pose {
    const c = this.canvas.getBoundingClientRect();
    const ppu = this.pixelsPerUnit();
    return { x: (viewportX - c.left - c.width / 2) / ppu, y: (c.height / 2 - (viewportY - c.top)) / ppu, scale: heightPx / ppu, rz: 0 };
  }

  private matrices(): Mat4 {
    const s = this.state;
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1);
    const model = mul(translate(s.x, s.y + s.lift, 0), mul(rotZ(s.rz), mul(rotX(s.rx), mul(rotY(s.ry), scale(s.scale)))));
    return mul(perspective(FOV, aspect, 0.1, 40), mul(translate(0, 0, -CAMERA), model));
  }

  /** A point on the bottle — `u`, `v` from its top-left, 0 to 1 — on the screen, in CSS pixels. */
  project(u: number, v: number): { x: number; y: number } {
    const m = this.matrices();
    const p = [(u - 0.5) * this.aspect, 0.5 - v, 0, 1];
    const out = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) out[r] = m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]! * p[3]!;
    return {
      x: ((out[0]! / out[3]!) * 0.5 + 0.5) * this.canvas.clientWidth,
      y: (0.5 - (out[1]! / out[3]!) * 0.5) * this.canvas.clientHeight,
    };
  }

  render(): void {
    const gl = this.gl;
    if (!this.count || gl.isContextLost()) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * ratio), h = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const s = this.state;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.cutTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.uniform1i(this.loc.uCut, 0);
    gl.uniform1i(this.loc.uHeight, 1);
    gl.uniformMatrix4fv(this.loc.uMvp, false, this.matrices());
    gl.uniform2f(this.loc.uSize, this.aspect, 1);
    gl.uniform1f(this.loc.uDepth, 0.07 * s.depth);
    gl.uniform2f(this.loc.uTexel, this.texel[0], this.texel[1]);
    gl.uniform3f(this.loc.uLight, s.light[0], s.light[1], s.light[2]);
    gl.uniform1f(this.loc.uSweep, s.sweep);
    gl.uniform1f(this.loc.uRelight, s.relight);
    // The reflection first, then the bottle over it.
    gl.uniform1f(this.loc.uMirror, 1);
    gl.uniform1f(this.loc.uOpacity, s.opacity * s.reflect);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.uniform1f(this.loc.uMirror, 0);
    gl.uniform1f(this.loc.uOpacity, s.opacity);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Everything this drew with, returned — the reveal can be opened many times
   * in one visit. The CONTEXT is not lost here on purpose: a canvas has one
   * context for life, and React mounts an effect twice in development, so a
   * second renderer on the same canvas would find it dead. The context goes
   * with its canvas, when the stage leaves the page.
   */
  dispose(): void {
    const gl = this.gl;
    for (const t of [this.cutTex, this.heightTex]) if (t) gl.deleteTexture(t);
    for (const b of [this.uvBuffer, this.indexBuffer]) if (b) gl.deleteBuffer(b);
    gl.deleteProgram(this.program);
    this.count = 0;
  }
}
