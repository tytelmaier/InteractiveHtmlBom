// Run with: node --test tests/test_zoom_geometry.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeRenderer(rotation, offsetBackRotation) {
  const front = { layer: 'F', bg: { width: 800, height: 400 }, transform: { s: 3, x: 40, y: 25, zoom: 1, panx: 0, pany: 0 } };
  const back = { layer: 'B', bg: { width: 400, height: 800 }, transform: { s: 2, x: -80, y: 35, zoom: 1, panx: 0, pany: 0 } };
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: true }) },
    document: { createElement: () => ({ getContext: () => ({}) }), getElementById: () => ({ clientWidth: 300, clientHeight: 300 }) },
    settings: { canvaslayout: 'FB', bomlayout: 'left-right', boardRotation: rotation, offsetBackRotation },
    pcbdata: { footprints: [
      { layer: 'F', bbox: { pos: [10, 20], relpos: [-2, -1], size: [4, 2], angle: 37 } },
      { layer: 'F', bbox: { pos: [30, -5], relpos: [-1, -2], size: [2, 4], angle: -73 } },
      { layer: 'B', bbox: { pos: [-10, 8], relpos: [-3, -4], size: [6, 8], angle: 21 } },
    ] }, allcanvas: { front, back },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'InteractiveHtmlBom', 'web', 'render.js'), 'utf8'), context);
  context.redrawCanvas = () => {};
  return context;
}

test('animation progresses smoothly, reaches target, and can be cancelled', () => {
  const c = makeRenderer(0, false);
  let id = 0;
  const callbacks = new Map();
  c.window.matchMedia = () => ({ matches: false });
  c.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
  c.cancelAnimationFrame = handle => callbacks.delete(handle);
  const frame = time => { const [handle, callback] = callbacks.entries().next().value; callbacks.delete(handle); callback(time); };
  const canvas = c.allcanvas.front;
  const start = { ...canvas.transform };
  c.zoomToFootprints([0]);
  frame(100);
  assert.equal(canvas.transform.zoom, start.zoom);
  frame(300);
  const middle = { ...canvas.transform };
  assert.notEqual(middle.zoom, start.zoom);
  frame(500);
  assert.notEqual(canvas.transform.zoom, middle.zoom);
  assert.equal(canvas.zoomAnimation, null);
  assert.equal(callbacks.size, 0);
  c.zoomToFootprints([1]);
  frame(600);
  c.cancelZoomAnimation(canvas);
  const stopped = JSON.stringify(canvas.transform);
  assert.equal(callbacks.size, 0);
  assert.equal(canvas.zoomAnimation, null);
  assert.equal(JSON.stringify(canvas.transform), stopped);
});

function screenCorners(fp, canvas, settings) {
  const t = canvas.transform;
  const rotate = ([x, y], degrees) => {
    const angle = degrees * Math.PI / 180;
    return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  };
  const result = [];
  for (const x of [fp.bbox.relpos[0], fp.bbox.relpos[0] + fp.bbox.size[0]]) {
    for (const y of [fp.bbox.relpos[1], fp.bbox.relpos[1] + fp.bbox.size[1]]) {
      let p = rotate([x, y], -fp.bbox.angle);
      p = rotate([p[0] + fp.bbox.pos[0], p[1] + fp.bbox.pos[1]], settings.boardRotation + (canvas.layer === 'B' && settings.offsetBackRotation ? -180 : 0));
      p = [p[0] * t.s + t.x, p[1] * t.s + t.y];
      if (canvas.layer === 'B') p[0] = -p[0];
      result.push([(p[0] + t.panx) * t.zoom, (p[1] + t.pany) * t.zoom]);
    }
  }
  return result;
}

for (const rotation of [0, 35, -90, 180]) {
  for (const offset of [false, true]) {
    test(`selected corners fit rotated boards: ${rotation} degrees, back offset ${offset}`, () => {
      const c = makeRenderer(rotation, offset);
      c.zoomToFootprints([0, 1, 2]);
      for (const fp of c.pcbdata.footprints) {
        const canvas = fp.layer === 'F' ? c.allcanvas.front : c.allcanvas.back;
        for (const [x, y] of screenCorners(fp, canvas, c.settings)) {
          assert.ok(x >= canvas.bg.width * 0.099 && x <= canvas.bg.width * 0.901, `x ${x}`);
          assert.ok(y >= canvas.bg.height * 0.099 && y <= canvas.bg.height * 0.901, `y ${y}`);
        }
      }
    });
  }
}

test('leaves unrelated, hidden, and invalid targets unchanged', () => {
  const c = makeRenderer(30, true);
  const before = JSON.stringify(c.allcanvas.back.transform);
  c.zoomToFootprints([0, 99]);
  assert.equal(JSON.stringify(c.allcanvas.back.transform), before);
  c.settings.canvaslayout = 'F';
  c.zoomToFootprints([2]);
  assert.equal(JSON.stringify(c.allcanvas.back.transform), before);
  const front = JSON.stringify(c.allcanvas.front.transform);
  c.settings.bomlayout = 'bom-only';
  c.zoomToFootprints([0]);
  assert.equal(JSON.stringify(c.allcanvas.front.transform), front);
  c.settings.bomlayout = 'left-right';
  c.pcbdata.footprints[0].bbox.size[0] = NaN;
  c.zoomToFootprints([0]);
  assert.equal(JSON.stringify(c.allcanvas.front.transform), front);
});

test('degenerate footprint geometry has finite, capped zoom', () => {
  const c = makeRenderer(0, false);
  c.pcbdata.footprints[0].bbox.size = [0, 0];
  c.zoomToFootprints([0]);
  assert.ok(Number.isFinite(c.allcanvas.front.transform.zoom));
  assert.ok(c.allcanvas.front.transform.zoom <= 25);
});
