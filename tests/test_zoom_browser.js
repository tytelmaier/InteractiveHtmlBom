// Run against a generated board with Node and Playwright available:
// IBOM_TEST_FILE=<absolute HTML path> node --test tests/test_zoom_browser.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

test('standalone BOM fits rows and individual references without changing unrelated interactions', async () => {
  assert.ok(process.env.IBOM_TEST_FILE, 'Set IBOM_TEST_FILE to a generated iBOM file');
  const browser = await chromium.launch({ executablePath: process.env.IBOM_CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(process.env.IBOM_TEST_FILE).href);
    try {
      await page.waitForFunction(() => window.initDone, null, { timeout: 15000 });
    } catch (error) {
      throw new Error(`BOM initialization failed: ${errors.join('; ')}`, { cause: error });
    }
    const board = await page.evaluate(() => ({ footprints: pcbdata.footprints.length,
      tracks: pcbdata.tracks ? Object.values(pcbdata.tracks).reduce((n, side) => n + side.length, 0) : 0 }));
    console.log(`Board: ${board.footprints} footprints, ${board.tracks} track segments`);
    await page.evaluate(() => { setHighlightRowOnClick(true); setZoomToSelect(true); });
    const row = page.locator('#bombody tr').filter({ has: page.locator('.bom-reference') }).filter({ has: page.locator('.bom-reference:nth-of-type(2)') }).first();
    assert.ok(await row.count(), 'board should have a grouped row');
    const firstRef = row.locator('.bom-reference').first();
    for (const dark of [false, true]) {
      await page.evaluate(dark => setDarkMode(dark), dark);
      const style = await firstRef.evaluate(el => {
        const actual = getComputedStyle(el);
        const cell = getComputedStyle(el.parentElement);
        return { width: el.offsetWidth, height: el.offsetHeight, background: actual.backgroundColor,
          font: actual.font, cellFont: cell.font, decoration: actual.textDecorationLine };
      });
      assert.ok(style.width < 44 && style.height < 44, 'references should not inherit toolbar dimensions');
      assert.equal(style.background, 'rgba(0, 0, 0, 0)');
      assert.equal(style.font, style.cellFont);
      assert.equal(style.decoration, 'none');
    }
    await row.locator('td').first().click();
    const group = await page.evaluate(() => ({ refs: highlightedFootprints.slice(), front: { ...allcanvas.front.transform }, back: { ...allcanvas.back.transform } }));
    assert.ok(group.refs.length > 1);
    await firstRef.click();
    const individual = await page.evaluate(() => ({ refs: highlightedFootprints.slice(), front: { ...allcanvas.front.transform }, back: { ...allcanvas.back.transform } }));
    assert.equal(individual.refs.length, 1);
    assert.ok(group.refs.includes(individual.refs[0]));
    assert.equal(await firstRef.getAttribute('aria-pressed'), 'true');
    await row.locator('td').first().click();
    assert.equal(await page.evaluate(() => highlightedFootprints.length), group.refs.length);
    assert.equal(await firstRef.getAttribute('aria-pressed'), 'false');
    await firstRef.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => highlightedFootprints.length), 1);
    assert.equal(await firstRef.getAttribute('aria-pressed'), 'true');
    await row.locator('td').first().click();
    await page.evaluate(() => { allcanvas.front.transform.zoom = 123; });
    await row.locator('td').first().click();
    assert.notEqual(await page.evaluate(() => allcanvas.front.transform.zoom), 123);
    const beforeControl = await page.evaluate(() => JSON.stringify(allcanvas.front.transform));
    const checkbox = row.locator('input[type=checkbox]').first();
    if (await checkbox.count()) await checkbox.click();
    assert.equal(await page.evaluate(() => JSON.stringify(allcanvas.front.transform)), beforeControl);
    await page.locator('#frontcanvas').click({ button: 'right', position: { x: 20, y: 20 } });
    assert.equal(await page.evaluate(() => allcanvas.front.transform.zoom), 1);
    await row.locator('td').first().click();
    assert.notEqual(await page.evaluate(() => allcanvas.front.transform.zoom), 1);
    // Switching targets and manual wheel zoom remain usable.
    await firstRef.evaluate(ref => {
      ref.click();
      ref.closest('tr').querySelector('td').click();
    });
    assert.equal(await page.evaluate(() => highlightedFootprints.length), group.refs.length);
    await page.locator('#frontcanvas').hover({ position: { x: 20, y: 20 } });
    await page.mouse.wheel(0, 30);
    await firstRef.click();
    assert.equal(await page.evaluate(() => highlightedFootprints.length), 1);
    const referenceName = await firstRef.innerText();
    const selectionBeforeThemeChange = await page.evaluate(() => ({
      ref: highlightedFootprints[0], front: JSON.stringify(allcanvas.front.transform),
      back: JSON.stringify(allcanvas.back.transform),
    }));
    for (const dark of [false, true, false]) {
      await page.evaluate(dark => setDarkMode(dark), dark);
      const selected = page.getByRole('button', { name: referenceName, exact: true }).first();
      assert.equal(await selected.getAttribute('aria-pressed'), 'true');
      assert.ok(await selected.evaluate(el => el.closest('tr').classList.contains('highlighted')));
      assert.deepEqual(await page.evaluate(() => highlightedFootprints.slice()), [selectionBeforeThemeChange.ref]);
      assert.equal(await page.evaluate(() => JSON.stringify(allcanvas.front.transform)), selectionBeforeThemeChange.front);
      assert.equal(await page.evaluate(() => JSON.stringify(allcanvas.back.transform)), selectionBeforeThemeChange.back);
    }
    for (const dark of [false, true]) {
      await page.evaluate(({ dark, referenceName }) => { setDarkMode(dark); updateFilter(referenceName); }, { dark, referenceName });
      const filteredRef = page.getByRole('button', { name: referenceName, exact: true }).first();
      const unselectedBounds = await filteredRef.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight }));
      await filteredRef.click();
      const highlight = await filteredRef.evaluate(el => {
        const sample = document.createElement('mark');
        sample.className = 'highlight';
        el.closest('.topmostdiv').appendChild(sample);
        const selected = getComputedStyle(el), filter = getComputedStyle(sample);
        const nested = getComputedStyle(el.querySelector('mark.highlight'));
        const properties = ['backgroundColor', 'color', 'padding', 'borderRadius'];
        const result = { filter: properties.map(p => filter[p]), nested: properties.map(p => nested[p]),
          selectedBackground: selected.backgroundColor, selectedColor: selected.color,
          cellColor: getComputedStyle(el.parentElement).color, outline: selected.boxShadow,
          selectedPadding: selected.padding, width: el.offsetWidth, height: el.offsetHeight };
        sample.remove();
        return result;
      });
      assert.deepEqual(highlight.nested, highlight.filter);
      assert.equal(highlight.selectedBackground, 'rgba(0, 0, 0, 0)');
      assert.equal(highlight.selectedColor, highlight.cellColor);
      assert.notEqual(highlight.outline, 'none');
      assert.equal(highlight.selectedPadding, '0px');
      assert.deepEqual({ width: highlight.width, height: highlight.height }, unselectedBounds);
    }
    const selectedBeforeFilter = await page.evaluate(() => ({
      ref: highlightedFootprints[0], front: JSON.stringify(allcanvas.front.transform),
      back: JSON.stringify(allcanvas.back.transform),
    }));
    await page.evaluate(() => setDarkMode(!settings.darkMode));
    assert.equal(await page.getByRole('button', { name: referenceName, exact: true }).first().getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => highlightedFootprints.slice()), [selectedBeforeFilter.ref]);
    assert.equal(await page.evaluate(() => JSON.stringify(allcanvas.front.transform)), selectedBeforeFilter.front);
    assert.equal(await page.evaluate(() => JSON.stringify(allcanvas.back.transform)), selectedBeforeFilter.back);
    const filterInput = page.locator('#filter');
    await filterInput.fill(referenceName);
    assert.equal(await page.getByRole('button', { name: referenceName, exact: true }).first().getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => highlightedFootprints.slice()), [selectedBeforeFilter.ref]);
    assert.equal(await page.evaluate(() => JSON.stringify(allcanvas.front.transform)), selectedBeforeFilter.front);
    assert.equal(await page.evaluate(() => JSON.stringify(allcanvas.back.transform)), selectedBeforeFilter.back);
    await filterInput.fill('');
    assert.equal(await page.getByRole('button', { name: referenceName, exact: true }).first().getAttribute('aria-pressed'), 'true');
    const otherReference = await page.locator('#bombody tr:not(.highlighted) .bom-reference').first().innerText();
    await filterInput.fill(otherReference);
    assert.equal(await page.locator('.bom-reference.selected-reference').count(), 0);
    assert.equal(await page.locator('#bombody tr.highlighted').count(), 1);
    assert.ok((await page.evaluate(() => highlightedFootprints.slice())).length > 0);
    assert.equal(await page.evaluate(() => JSON.stringify(allcanvas.front.transform)), selectedBeforeFilter.front);
    await filterInput.fill('__no_matching_part_9f17__');
    assert.equal(await page.locator('#bombody tr').count(), 0);
    assert.deepEqual(await page.evaluate(() => highlightedFootprints.slice()), []);
    assert.equal(await page.evaluate(() => highlightedNet), null);
    await filterInput.fill('');
    assert.equal(await page.locator('.bom-reference.selected-reference').count(), 0);
    // Selection must not reflow long grouped rows or move the rows below them.
    const longestRow = await page.locator('#bombody tr').evaluateAll(rows => rows.reduce((best, row) =>
      row.querySelectorAll('.bom-reference').length > best.count
        ? { id: row.id, count: row.querySelectorAll('.bom-reference').length } : best, { id: '', count: 0 }));
    assert.ok(longestRow.count >= 2);
    const measureRows = () => page.locator('#bombody tr').evaluateAll(rows => rows.map(row => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, height: rect.height, refs: [...row.querySelectorAll('.bom-reference')].map(ref => {
        const box = ref.getBoundingClientRect();
        return [box.left, box.top, box.width, box.height];
      }) };
    }));
    const beforeSelection = await measureRows();
    await page.locator(`#${longestRow.id} .bom-reference`).first().evaluate(el => el.click());
    assert.deepEqual(await measureRows(), beforeSelection);
    await page.locator(`#${longestRow.id} .bom-reference`).last().evaluate(el => el.click());
    assert.deepEqual(await measureRows(), beforeSelection);
    await page.evaluate(() => {
      Object.assign(allcanvas.front.transform, { zoom: 4, panx: 10, pany: 20 });
      Object.assign(allcanvas.back.transform, { zoom: 3, panx: -10, pany: -20 });
      setZoomToSelect(false);
    });
    assert.deepEqual(await page.evaluate(() => [allcanvas.front, allcanvas.back].map(({ transform }) =>
      [transform.zoom, transform.panx, transform.pany])), [[1, 0, 0], [1, 0, 0]]);
    assert.equal(await page.locator('.bom-reference').count(), 0);
    await page.evaluate(() => {
      setZoomToSelect(true);
      Object.assign(allcanvas.front.transform, { zoom: 2, panx: 10, pany: 20 });
      Object.assign(allcanvas.back.transform, { zoom: 3, panx: -10, pany: -20 });
      setHighlightRowOnClick(false);
    });
    assert.deepEqual(await page.evaluate(() => [allcanvas.front, allcanvas.back].map(({ transform }) =>
      [transform.zoom, transform.panx, transform.pany])), [[2, 10, 20], [3, -10, -20]]);
    assert.equal(await page.evaluate(() => settings.zoomToSelect), true);
    assert.equal(await page.locator('#zoomToSelectCheckbox').isChecked(), true);
    assert.equal(await page.locator('#zoomToSelectCheckbox').isDisabled(), true);
    assert.equal(await page.locator('.bom-reference').count(), 0);
    await page.locator('#bombody tr td').first().click();
    assert.deepEqual(await page.evaluate(() => [allcanvas.front, allcanvas.back].map(({ transform }) =>
      [transform.zoom, transform.panx, transform.pany])), [[2, 10, 20], [3, -10, -20]]);
    await page.evaluate(() => setHighlightRowOnClick(true));
    assert.equal(await page.locator('#zoomToSelectCheckbox').isEnabled(), true);
    assert.equal(await page.locator('#zoomToSelectCheckbox').isChecked(), true);
    assert.deepEqual(await page.evaluate(() => [allcanvas.front, allcanvas.back].map(({ transform }) =>
      [transform.zoom, transform.panx, transform.pany])), [[2, 10, 20], [3, -10, -20]]);
    await page.locator('#bombody tr td').first().click();
    assert.notDeepEqual(await page.evaluate(() => [allcanvas.front, allcanvas.back].map(({ transform }) =>
      [transform.zoom, transform.panx, transform.pany])), [[2, 10, 20], [3, -10, -20]]);
    await page.evaluate(() => setHighlightRowOnClick(false));
    await page.reload();
    await page.waitForFunction(() => window.initDone);
    assert.equal(await page.locator('#zoomToSelectCheckbox').isChecked(), true);
    assert.equal(await page.locator('#zoomToSelectCheckbox').isDisabled(), true);
    assert.equal(await page.evaluate(() => isZoomToSelectActive()), false);
    assert.equal(await page.locator('.bom-reference').count(), 0);
    await page.evaluate(() => setHighlightRowOnClick(true));
    assert.equal(await page.locator('#zoomToSelectCheckbox').isChecked(), true);
    assert.equal(await page.evaluate(() => isZoomToSelectActive()), true);
    await page.evaluate(() => {
      Object.assign(allcanvas.front.transform, { zoom: 3, panx: 2, pany: 4 });
      Object.assign(allcanvas.back.transform, { zoom: 2, panx: -2, pany: -4 });
      setZoomToSelect(false);
    });
    assert.deepEqual(await page.evaluate(() => [allcanvas.front, allcanvas.back].map(({ transform }) =>
      [transform.zoom, transform.panx, transform.pany])), [[1, 0, 0], [1, 0, 0]]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
