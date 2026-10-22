// Проверка пакета сценариев: node tools/validate-pack.cjs [путь]
const fs = require('fs'); const path = require('path');
const TV = require('../app/src/main/assets/engine.js');
const file = process.argv[2] || path.join(__dirname, '../app/src/main/assets/content/core-ru.json');
const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
const errs = TV.validatePack(pack);
// Для каждого offer-узла при самом скромном контексте должно найтись >= 2 варианта
const P = TV.indexPack(pack); const D = TV.migrate({});
const minimal = [{ need: 'rest', energy: 1, time: 10, setting: 'home' }, { need: 'company', energy: 1, time: 10, setting: 'home', intoxicated: true },
  { need: 'novelty', energy: 1, time: 5, setting: 'home' }];
for (const f of pack.flows) for (const n of f.nodes) if (n.type === 'offer') for (const ctx of minimal) {
  const r = TV.rank(P, D, ctx, { category: n.offer.category, max_effort: n.offer.max_effort });
  if (r.items.length < 2) errs.push(`flow ${f.id}/${n.id}: при ${JSON.stringify(ctx)} меньше 2 вариантов`);
}
if (errs.length) { console.error('PACK INVALID\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`PACK OK ${pack.pack_id}@${pack.version}: ${pack.scenarios.length} сценариев, ${pack.flows.length} flow`);
