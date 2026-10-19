// BottleGL — a photographed bottle rendered as a relit 2.5D object.
//
// Input: the bottle's cut-out (RGBA) and its height map (greyscale), from
// tools/bottle_to_25d.py. Output: a mesh whose vertices stand out by the height
// map, lit by a light the visitor moves, with a glass highlight and a sheen
// that travels across it, and its reflection on a polished surface.
//
// Plain WebGL 1, no library: the whole renderer is this file (~6 KB minified),
// which is the case for not adding Three.js for this effect.

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
uniform float uNormal;
uniform float uMirror;
uniform float uOpacity;
uniform vec3 uTint;
uniform float uRelight;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uCut, vUv);
  if (c.a < 0.01) discard;
  // A wide stencil: an 8-bit height map steps, and a narrow one would draw the steps.
  vec2 o = uTexel * 2.5;
  float hl = texture2D(uHeight, vUv - vec2(o.x, 0.0)).r;
  float hr = texture2D(uHeight, vUv + vec2(o.x, 0.0)).r;
  float hu = texture2D(uHeight, vUv - vec2(0.0, o.y)).r;
  float hd = texture2D(uHeight, vUv + vec2(0.0, o.y)).r;
  vec3 n = normalize(vec3((hl - hr) * uNormal, (hd - hu) * uNormal, 1.0));
  vec3 l = normalize(uLight);
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  // The photograph keeps its own light; this adds the room's, gently.
  float diffuse = 0.84 + 0.16 * max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, h), 0.0), 64.0) * 0.9;
  float rim = pow(1.0 - n.z, 1.7) * 0.32;
  float band = vUv.x * 0.8 + vUv.y * 0.5 - uSweep;
  float sheen = smoothstep(0.12, 0.0, abs(band)) * 0.20;
  // uRelight 0 is the photograph exactly as taken, for the moment the object
  // lies over its own picture; 1 is the bottle in the room's light.
  vec3 colour = mix(c.rgb, c.rgb * diffuse + (spec + rim + sheen) * uTint, uRelight);
  float a = c.a * uOpacity;
  if (uMirror > 0.5) { a *= 0.13 * smoothstep(0.55, 1.0, vUv.y); }
  gl_FragColor = vec4(colour * a, a);
}`;

// --- a little matrix arithmetic, column-major like WebGL --------------------
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
};
const perspective = (fovy, aspect, near, far) => {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
};
const translate = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
const scale = (k) => new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]);

// The camera: 3.9 units back, a 30-degree lens. At that distance one unit is
// height / (2 * 3.9 * tan 15deg) CSS pixels, which is what lets the object be
// laid exactly over a photograph on the page.
const CAMERA = 3.9, FOV = Math.PI / 6;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = url;
});

export class BottleGL {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    this.program = program;
    this.loc = {};
    for (const name of ['uHeight', 'uCut', 'uMvp', 'uSize', 'uDepth', 'uMirror', 'uTexel', 'uLight', 'uSweep', 'uNormal', 'uOpacity', 'uTint', 'uRelight']) {
      this.loc[name] = gl.getUniformLocation(program, name);
    }
    this.aUv = gl.getAttribLocation(program, 'aUv');
    // x, y: where the bottle's centre stands, in world units. depth 0 is the
    // flat photograph; 1 stands the faces out by the height map.
    this.state = { x: 0, y: 0.06, rx: 0, ry: 0, rz: 0, scale: 1, lift: 0, opacity: 1, reflect: 1, relight: 1, depth: 1, light: [0.4, 0.5, 1], sweep: -1, tint: [1, 1, 1] };
  }

  async load(cutUrl, heightUrl) {
    const gl = this.gl;
    const [cut, height] = await Promise.all([loadImage(cutUrl), loadImage(heightUrl)]);
    // Opening another perfume replaces the last one's textures and mesh.
    for (const t of [this.cutTex, this.heightTex]) if (t) gl.deleteTexture(t);
    for (const b of [this.uvBuffer, this.indexBuffer]) if (b) gl.deleteBuffer(b);
    const texture = (image, unit) => {
      const t = gl.createTexture();
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

    // A grid dense enough for the height map's rounded edges to read.
    const cols = 140, rows = Math.round(140 / this.aspect);
    const uv = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) uv.push(c / cols, r / rows);
    const index = [];
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
    return this;
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.canvas.width = Math.round(w * ratio);
      this.canvas.height = Math.round(h * ratio);
    }
  }

  /** The model-view-projection the last frame used, for projecting points to the screen. */
  matrices() {
    const { x, y, rx, ry, rz, scale: k, lift } = this.state;
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1);
    const projection = perspective(FOV, aspect, 0.1, 20);
    // The bottle is 1 unit tall, centred on (x, y); the reflection hangs below its foot.
    const model = mul(translate(x, y + lift, 0), mul(rotZ(rz), mul(rotX(rx), mul(rotY(ry), scale(k)))));
    const view = translate(0, 0, -CAMERA);
    return { mvp: mul(projection, mul(view, model)) };
  }

  /** CSS pixels per world unit, on the plane the bottle stands in. */
  pixelsPerUnit() {
    return this.canvas.clientHeight / (2 * CAMERA * Math.tan(FOV / 2));
  }

  /**
   * The pose that lays the cut-out exactly over the bottle in its photograph,
   * where the photograph is drawn at `rect` (viewport pixels, object-fit
   * filling it). `placement` is the pipeline's record of where the cut-out
   * sat in the photo: its centre and height as fractions, and its angle.
   */
  poseOver(rect, placement) {
    const c = this.canvas.getBoundingClientRect();
    const ppu = this.pixelsPerUnit();
    const sx = rect.left + placement.centre[0] * rect.width - c.left;
    const sy = rect.top + placement.centre[1] * rect.height - c.top;
    return { x: (sx - c.width / 2) / ppu, y: (c.height / 2 - sy) / ppu, scale: (placement.height * rect.height) / ppu, rz: (placement.angle * Math.PI) / 180 };
  }

  /** The standing pose: upright, 1 unit tall, centred on the viewport x given. */
  poseStanding(viewportX) {
    const c = this.canvas.getBoundingClientRect();
    return { x: (viewportX - c.left - c.width / 2) / this.pixelsPerUnit(), y: 0.06, scale: 1, rz: 0 };
  }

  /** A point on the bottle (x, y in its own units, 0..1 from the top-left) on the screen, in CSS pixels. */
  project(u, v) {
    const { mvp } = this.matrices();
    const w = this.aspect, h = 1;
    const p = [(u - 0.5) * w, (0.5 - v) * h, 0, 1];
    const out = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) out[r] = mvp[r] * p[0] + mvp[4 + r] * p[1] + mvp[8 + r] * p[2] + mvp[12 + r] * p[3];
    return { x: (out[0] / out[3] * 0.5 + 0.5) * this.canvas.clientWidth, y: (0.5 - out[1] / out[3] * 0.5) * this.canvas.clientHeight };
  }

  render() {
    const gl = this.gl;
    if (!this.count) return;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
    const s = this.state;
    gl.uniformMatrix4fv(this.loc.uMvp, false, this.matrices().mvp);
    gl.uniform2f(this.loc.uSize, this.aspect, 1);
    gl.uniform1f(this.loc.uDepth, 0.07 * s.depth);
    gl.uniform1f(this.loc.uRelight, s.relight);
    gl.uniform2f(this.loc.uTexel, this.texel[0], this.texel[1]);
    gl.uniform3f(this.loc.uLight, ...s.light);
    gl.uniform1f(this.loc.uSweep, s.sweep);
    gl.uniform1f(this.loc.uNormal, 3.6);
    gl.uniform1f(this.loc.uOpacity, s.opacity);
    gl.uniform3f(this.loc.uTint, ...s.tint);
    // The reflection first, then the bottle over it.
    gl.uniform1f(this.loc.uMirror, 1);
    gl.uniform1f(this.loc.uOpacity, s.opacity * s.reflect);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.uniform1f(this.loc.uMirror, 0);
    gl.uniform1f(this.loc.uOpacity, s.opacity);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }
}
