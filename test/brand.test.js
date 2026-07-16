'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityBrand', () => {
  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityBrand;
    delete global.PriorityRestConfig;
    delete global.PriorityUI;
  });

  it('exposes customizable appName defaulting to Cerveau', () => {
    const g = loadComponent('shared/brand.js');
    assert.equal(g.PriorityBrand.appName, 'Cerveau');
    assert.equal(g.PriorityBrand.getAppName(), 'Cerveau');
  });

  it('getAppName trims and falls back when empty', () => {
    const g = loadComponent('shared/brand.js');
    g.PriorityBrand.appName = '  Nova  ';
    assert.equal(g.PriorityBrand.getAppName(), 'Nova');
    g.PriorityBrand.appName = '   ';
    assert.equal(g.PriorityBrand.getAppName(), 'Cerveau');
  });

  it('PriorityUI DEFINE_PRIORITY_LABEL follows brand name', () => {
    loadComponent('shared/brand.js');
    const g = loadComponent('priority/priority-ui.js');
    assert.equal(g.PriorityUI.DEFINE_PRIORITY_LABEL, 'Cerveau');
  });

  it('rest-config picks up brand appName', () => {
    const g = loadComponent('shared/brand.js');
    g.PriorityBrand.appName = 'Renamed';
    loadComponent('shared/rest-config.js');
    assert.equal(g.PriorityRestConfig.appName, 'Renamed');
  });
});
