/**
 * 打印某天的配额达成情况，供编辑任务自检。
 *
 * 用法：node scripts/check-quota.mjs YYYY-MM-DD
 *
 * 永不返回非零退出码：配额不足不能阻断发布，只能被记录。
 */
import { byDate, coverageOf } from '../src/lib/content.ts';
import { industries } from '../src/config/taxonomy.ts';
import { coveredRegions } from '../src/config/regions.ts';
import { site } from '../src/config/site.ts';

const date = process.argv[2];
if (!date) {
  console.error('用法：node scripts/check-quota.mjs YYYY-MM-DD');
  process.exit(2);
}

const items = byDate(date);
const counts = Object.fromEntries(
  industries.map((industry) => [industry.slug, items.filter((i) => i.industry === industry.slug).length])
);

const { covered, missing } = coverageOf(date, items);

const industriesOk = industries.every((industry) => {
  const count = counts[industry.slug] ?? 0;
  return count >= site.perIndustryDailyMin && count <= site.perIndustryDailyLimit;
});

console.log(
  JSON.stringify(
    {
      date,
      industries: counts,
      regions: covered.map((region) => region.slug),
      missing: missing.map((region) => region.slug),
      thresholds: {
        perIndustryMin: site.perIndustryDailyMin,
        perIndustryMax: site.perIndustryDailyLimit,
        regionsMin: site.regionsDailyMin,
        coveredRegionCount: coveredRegions.length,
      },
      ok: industriesOk && missing.length === 0,
    },
    null,
    2
  )
);
