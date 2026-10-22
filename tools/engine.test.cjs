const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const TV = require('../app/src/main/assets/engine.js');
const pack = TV.indexPack(JSON.parse(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/content/core-ru.json'), 'utf8')));
const fresh = () => TV.migrate({ entries: [{ id: 'old1', ts: 1700000000000, type: 'craving', intensity: 5, wants: [], triggers: [] }],
  reminders: [{ t: '10:00', k: 'morning', on: true }, { t: '16:30', k: 'afternoon', on: true }, { t: '19:00', k: 'evening', on: true }, { t: '22:30', k: 'night', on: true }] });
const offer = (D, sid, ago = 0, now = Date.now()) => { const o = TV.stamp({ session_id: 's', scenario_id: sid, scenario_revision: 1, variant_key: 'default', position: 0, ranker_id: 'rules-v1', score: 0, features: {}, shown_at: now - ago }); D.offers.push(o); return o; };

test('миграция v1 -> v2 сохраняет старые записи и добавляет поля', () => {
  const D = fresh();
  assert.equal(D.schema_version, 2); assert.ok(D.install_id);
  assert.equal(D.entries[0].id, 'old1'); assert.equal(D.entries[0].created_at, 1700000000000); assert.equal(D.entries[0].sync_state, 'local');
  assert.deepEqual(D.reminders.map(r => r.k), ['morning', 'plan', 'afternoon', 'pre', 'evening', 'night']);
  const again = TV.migrate(D); assert.equal(again.reminders.length, 6); assert.equal(again.events.filter(e => e.type === 'migrated').length, 1);
});

test('дома без выхода — никаких уличных сценариев', () => {
  const D = fresh(); const r = TV.rank(pack, D, { need: 'switch_off', energy: 2, time: 30, setting: 'home' });
  assert.ok(r.items.length >= 2); r.items.forEach(i => assert.notEqual(pack.byId[i.scenario_id].setting, 'outdoors'));
});

test('после употребления: нет улицы и физнагрузки', () => {
  const D = fresh(); const r = TV.rank(pack, D, { need: 'movement', energy: 3, time: 60, setting: 'any', intoxicated: true });
  r.items.forEach(i => assert.ok(pack.byId[i.scenario_id].intoxicated_ok, i.scenario_id));
});

test('alcohol_shift только в своей ветке', () => {
  const D = fresh();
  TV.rank(pack, D, { need: 'rest', energy: 1, time: 60, setting: 'home' }).items.forEach(i => assert.notEqual(i.category, 'alcohol_shift'));
  const r = TV.rank(pack, D, { setting: 'home' }, { category: 'alcohol_shift' });
  assert.ok(r.items.length >= 2); r.items.forEach(i => assert.equal(i.category, 'alcohol_shift'));
});

test('анкета: не люблю фото, бюджет 0, ограничение подвижности', () => {
  const D = fresh(); D.profile = { dislikes: ['photo'], budget: 0, constraints: ['mobility'], can_leave_home_evening: 'yes' };
  const r = TV.rank(pack, D, { energy: 3, time: 60, setting: 'any' });
  r.items.forEach(i => { const s = pack.byId[i.scenario_id]; assert.ok(!s.tags.includes('photo')); assert.equal(s.cost, 0); assert.ok(!s.excludes_if.includes('mobility')); });
});

test('потребность поднимает подходящие сценарии', () => {
  const D = fresh(); const r = TV.rank(pack, D, { need: 'company', energy: 2, time: 20, setting: 'home' });
  assert.ok(pack.byId[r.items[0].scenario_id].needs.includes('company'));
});

test('два «не люблю» скрывают сценарий, «не могу сейчас» — нет', () => {
  const D = fresh(); const ctx = { need: 'rest', energy: 1, time: 15, setting: 'home' };
  for (const reason of ['dislike', 'dislike']) { const o = offer(D, 'blanket_silence', 5 * 86400000); D.responses.push(TV.stamp({ offer_id: o.id, action: 'declined', decline_reason: reason })); }
  for (const reason of ['cant_now', 'cant_now', 'cant_now']) { const o = offer(D, 'five_min_nothing', 5 * 86400000); D.responses.push(TV.stamp({ offer_id: o.id, action: 'declined', decline_reason: reason })); }
  const r = TV.rank(pack, D, ctx);
  assert.equal(r.excluded.blanket_silence, 'disliked'); assert.ok(r.items.find(i => i.scenario_id === 'five_min_nothing'));
});

test('«стало лучше» поднимает сценарий, недавний показ — опускает', () => {
  const D = fresh(); const ctx = { need: 'switch_off', energy: 2, time: 20, setting: 'home' };
  const base = TV.rank(pack, D, ctx).items; const target = base[base.length - 1].scenario_id;
  for (let k = 0; k < 3; k++) { const o = offer(D, target, 10 * 86400000); D.feedback.push(TV.stamp({ offer_id: o.id, tried: 'yes', result: 'better', answered_at: Date.now() - 10 * 86400000 })); }
  const after = TV.rank(pack, D, ctx).items; assert.ok(after.findIndex(i => i.scenario_id === target) < base.findIndex(i => i.scenario_id === target));
  const top = after[0].scenario_id; offer(D, top, 60000);
  assert.ok(TV.rank(pack, D, ctx).items.find(i => i.scenario_id === top).score < after[0].score);
});

test('pick: два варианта разных категорий, исследование помечается', () => {
  const D = fresh(); const r = TV.rank(pack, D, { need: 'novelty', energy: 2, time: 20, setting: 'home' });
  const two = TV.pick(r, 2, { rng: () => 0.99 }); assert.equal(two.length, 2); assert.notEqual(two[0].category, two[1].category);
  assert.equal(two[1].features.explore, 0);
  const ex = TV.pick(r, 2, { rng: () => 0.01 }); assert.equal(ex[1].features.explore, 1);
});

test('вариант по силам и времени', () => {
  assert.equal(TV.variantFor(pack.byId.two_pages, { energy: 1 }).key, 'low_energy');
  assert.equal(TV.variantFor(pack.byId.three_odd_details, { energy: 2, time: 5 }).key, 'short');
  assert.equal(TV.variantFor(pack.byId.three_odd_details, { energy: 2, time: 30 }).key, 'default');
});

test('блокировка пользователем', () => {
  const D = fresh(); D.prefs.window_air = { blocked: true };
  assert.equal(TV.rank(pack, D, { need: 'rest', energy: 1, time: 10, setting: 'home' }).excluded.window_air, 'blocked');
});

test('валидатор ловит ошибки', () => {
  const bad = JSON.parse(JSON.stringify(pack)); delete bad.byId; delete bad.flowsById;
  bad.scenarios[0].fallback_id = 'nope'; bad.flows[0].nodes.push({ id: 'orphan', type: 'end', text: 'x' });
  bad.scenarios.push(Object.assign({}, bad.scenarios.find(s => s.category === 'alcohol_shift'), { id: 'bad_shift', variants: [{ key: 'default', text: 'Твоя награда — ещё одна банка' }] }));
  const errs = TV.validatePack(bad).join('\n');
  assert.match(errs, /fallback nope/); assert.match(errs, /недостижимый узел orphan/); assert.match(errs, /запрещённая формулировка/);
});

test('условия узлов', () => {
  assert.ok(TV.condTrue({ 'ctx.need': '*' }, { need: 'rest' }, {}));
  assert.ok(!TV.condTrue({ 'ctx.need': '*' }, {}, {}));
  assert.ok(TV.condTrue({ 'profile.can_leave_home_evening': 'no', 'ctx.intoxicated': true }, { intoxicated: true }, null));
  assert.equal(TV.fill('«{title}» в {time}', { title: 'Чай', time: '19:00' }), '«Чай» в 19:00');
});
