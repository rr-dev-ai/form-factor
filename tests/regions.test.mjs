import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regions, REGION_SLUGS, coveredRegions, regionName, regionIssues,
} from '../src/config/regions.ts';

test('8 个区域，slug 唯一', () => {
  assert.equal(regions.length, 8);
  assert.equal(new Set(REGION_SLUGS).size, 8);
});

test('每个区域三语名都非空', () => {
  for (const r of regions) {
    for (const l of ['zh', 'en', 'es']) {
      assert.ok(r.name[l] && r.name[l].length > 0, `${r.slug}.${l} 为空`);
    }
  }
});

test('计入覆盖的是 7 个，且不含 global', () => {
  assert.equal(coveredRegions.length, 7);
  assert.ok(!coveredRegions.some((r) => r.slug === 'global'));
});

test('regionName 未知 slug 回退为原值', () => {
  assert.equal(regionName('apac', 'zh'), '亚太');
  assert.equal(regionName('mars', 'zh'), 'mars');
});

test('regionIssues 放行合法组合', () => {
  assert.deepEqual(regionIssues({ region: 'apac', regions: ['europe'] }), []);
  assert.deepEqual(regionIssues({ region: 'global', regions: [] }), []);
});

test('regionIssues 拦下三种非法组合与未知 slug', () => {
  assert.match(regionIssues({ region: 'apac', regions: ['apac'] })[0], /主区域/);
  assert.match(regionIssues({ region: 'apac', regions: ['global'] })[0], /global/);
  assert.match(regionIssues({ region: 'global', regions: ['latam'] })[0], /为空/);
  assert.match(regionIssues({ region: 'mars', regions: [] })[0], /未知主区域/);
});
