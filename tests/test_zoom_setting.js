// Run with: node --test tests/test_zoom_setting.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makePage(initialValues = {}, hasStorage = true) {
  const values = new Map(Object.entries(initialValues));
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        checked: false, disabled: false, value: '', style: {},
        classList: { toggle(name, active) { this[name] = active; } },
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    window: { matchMedia: () => ({ addListener: () => {} }) }, resizeAll: () => {},
    document: { getElementById: element, forms: { highlightpin1: { highlightpin1: {} } } },
    storage: hasStorage ? {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    } : null,
    storagePrefix: '', initDone: false,
    config: { bom_view: 'left-right', layer_view: 'FB', checkboxes: '', fields: [], highlight_pin1: 'none' },
    pcbdata: { metadata: {}, nets: [] },
  });
  const web = path.join(__dirname, '..', 'InteractiveHtmlBom', 'web');
  vm.runInContext(fs.readFileSync(path.join(web, 'util.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(web, 'ibom.js'), 'utf8'), context);
  context.storagePrefix = '';
  // These unrelated rendering and layout operations are not needed for settings tests.
  for (const name of ['padsVisible', 'fabricationVisible', 'silkscreenVisible',
    'referencesVisible', 'valuesVisible', 'tracksVisible', 'zonesVisible',
    'dnpOutline', 'setRedrawOnDrag', 'setDarkMode', 'setHighlightPin1',
    'setOffsetBackRotation', 'populateMarkWhenCheckedOptions', 'prepCheckboxes',
    'changeBomLayout', 'populateBomTable']) context[name] = () => {};
  return { context, element, values };
}

test('default, enable, and parent-off transitions', () => {
  const { context: c, element, values } = makePage();
  c.initDefaults();
  assert.equal(c.settings.highlightRowOnClick, false);
  assert.equal(c.settings.zoomToSelect, false);
  assert.equal(element('zoomToSelectCheckbox').disabled, true);
  assert.equal(element('zoomToSelectLabel').classList.disabled, true);
  c.setHighlightRowOnClick(true);
  c.setZoomToSelect(true);
  assert.equal(element('zoomToSelectCheckbox').checked, true);
  assert.equal(element('zoomToSelectCheckbox').disabled, false);
  assert.equal(values.get('zoomToSelect'), 'true');
  c.setHighlightRowOnClick(false);
  assert.equal(c.settings.zoomToSelect, false);
  assert.equal(values.get('zoomToSelect'), 'false');
  c.setHighlightRowOnClick(true);
  assert.equal(element('zoomToSelectCheckbox').checked, false);
});

test('restore valid saved state and normalize invalid state', () => {
  const valid = makePage({ highlightRowOnClick: 'true', zoomToSelect: 'true' });
  valid.context.initDefaults();
  assert.equal(valid.context.settings.zoomToSelect, true);
  assert.equal(valid.element('zoomToSelectCheckbox').checked, true);
  const invalid = makePage({ highlightRowOnClick: 'false', zoomToSelect: 'true' });
  invalid.context.initDefaults();
  assert.equal(invalid.context.settings.zoomToSelect, false);
  assert.equal(invalid.values.get('zoomToSelect'), 'false');
});

test('import restores valid state and clears missing or inconsistent child', () => {
  const { context: c, values } = makePage();
  c.initDefaults();
  c.overwriteSettings({ highlightRowOnClick: true, zoomToSelect: true });
  assert.equal(c.settings.zoomToSelect, true);
  assert.equal(JSON.parse(JSON.stringify(c.settings)).zoomToSelect, true);
  c.overwriteSettings({ highlightRowOnClick: true });
  assert.equal(c.settings.zoomToSelect, false);
  c.overwriteSettings({ highlightRowOnClick: false, zoomToSelect: true });
  assert.equal(c.settings.zoomToSelect, false);
  assert.equal(values.get('zoomToSelect'), 'false');
});

test('dependency works without browser storage', () => {
  const { context: c } = makePage({}, false);
  c.initDefaults();
  c.setHighlightRowOnClick(true);
  c.setZoomToSelect(true);
  assert.equal(c.settings.zoomToSelect, true);
  c.setHighlightRowOnClick(false);
  assert.equal(c.settings.zoomToSelect, false);
});
