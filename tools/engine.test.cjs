const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const TV = require('../app/src/main/assets/engine.js');
const pack = TV.indexPack(JSON.parse(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/content/core-ru.json'), 'utf8')));
const fresh = () => TV.migrate({ entries: [{ id: 'old1', ts: 1700000000000, type: 'craving', intensity: 5, wants: [], triggers: [] }],
  reminders: [{ t: '10:00', k: 'morning', on: true }, { t: '16:30', k: 'afternoon', on: true }, { t: '19:00', k: 'evening', on: true }, { t: '22:30', k: 'night', on: true }] });
const offer = (D, sid, ago = 0, now = Date.now()) => { const o = TV.stamp({ session_id: 's', scenario_id: sid, scenario_revision: 1, variant_key: 'default', position: 0, ranker_id: TV.RANKER_ID, score: 0, features: {}, shown_at: now - ago, context: {} }); D.offers.push(o); return o; };
const done = (D, sid, tried = 'yes', result = 'better', at = Date.now()) => { const o = offer(D, sid, Date.now() - at + 1000); D.feedback.push(TV.stamp({ offer_id: o.id, tried, result, answered_at: at })); return o; };
const ctx = (x) => Object.assign({ place: 'sofa', mode: 'now', hour: 20, craving: 0, can_go_out: true, fill: {} }, x);
const ids = r => r.items.map(i => i.scenario_id);

test('миграция до схемы 3 сохраняет записи и добавляет поля', () => {
  const D = fresh();
  assert.equal(D.schema_version, 3); assert.ok(D.install_id);
  assert.equal(D.entries[0].id, 'old1'); assert.equal(D.entries[0].created_at, 1700000000000); assert.equal(D.entries[0].sync_state, 'local');
  assert.deepEqual(D.reminders.map(r => r.k), ['morning', 'plan', 'afternoon', 'pre', 'evening', 'night']);
  assert.deepEqual(D.places_log, []); assert.equal(D.now.mode, 'now'); assert.equal(D.now.place, null);
  const again = TV.migrate(D); assert.equal(again.reminders.length, 6); assert.equal(again.events.filter(e => e.type === 'migrated').length, 1);
});

test('пакет проходит валидацию и покрытие', () => {
  const raw = JSON.parse(JSON.stringify(pack)); delete raw.byId; delete raw.flowsById;
  assert.deepEqual(TV.validatePack(raw), []); assert.deepEqual(TV.coverage(pack, fresh(), 4), []);
  assert.ok(pack.scenarios.length >= 150);
  for (const s of TV.SECTORS) assert.ok(pack.scenarios.filter(x => x.sector === s).length >= 15, s);
});

test('место фильтрует ходы', () => {
  const D = fresh();
  for (const place of ['kitchen', 'road', 'work', 'city']) {
    const r = TV.rank(pack, D, ctx({ place })); assert.ok(r.items.length >= 4, place);
    r.items.forEach(i => assert.ok(pack.byId[i.scenario_id].places.includes(place), place + ' ' + i.scenario_id));
  }
});

test('нельзя выйти — нет ходов, уводящих из дома', () => {
  const D = fresh(); const r = TV.rank(pack, D, ctx({ can_go_out: false }));
  r.items.forEach(i => { const s = pack.byId[i.scenario_id]; assert.ok(!(s.to && TV.isOut(s.to)), i.scenario_id); assert.ok(!s.requires.includes('can_leave_home')); });
});

test('после употребления: нет улицы и нагрузки', () => {
  const D = fresh(); const r = TV.rank(pack, D, ctx({ intoxicated: true, hour: 22 }));
  assert.ok(r.items.length >= 3);
  r.items.forEach(i => { const s = pack.byId[i.scenario_id]; assert.ok(s.intoxicated_ok, i.scenario_id); assert.ok(!(s.to && TV.isOut(s.to))); });
});

test('режим «всё равно выпью» — только одно изменение, и только в нём', () => {
  const D = fresh();
  TV.rank(pack, D, ctx()).items.forEach(i => assert.notEqual(i.sector, 'shift'));
  const r = TV.rank(pack, D, ctx({ mode: 'shift' })); assert.ok(r.items.length >= 3);
  r.items.forEach(i => assert.equal(i.sector, 'shift'));
});

test('сильная тяга — только короткие и лёгкие ходы', () => {
  const D = fresh(); const r = TV.rank(pack, D, ctx({ craving: 8 }));
  assert.ok(r.items.length >= 3); r.items.forEach(i => { const s = pack.byId[i.scenario_id]; assert.ok(s.duration_min <= 20 && s.effort <= 2, i.scenario_id); });
});

test('план на вечер — без переходов и работы', () => {
  const D = fresh(); const r = TV.rank(pack, D, ctx({ place: null, mode: 'plan', hour: 14 }));
  assert.ok(r.items.length >= 10); r.items.forEach(i => { const s = pack.byId[i.scenario_id]; assert.notEqual(s.kind, 'transition'); assert.ok(!s.places.every(p => p === 'work')); });
});

test('анкета: не люблю фото, бюджет 0, ограничение подвижности', () => {
  const D = fresh(); D.profile = { dislikes: ['photo'], budget: 0, constraints: ['mobility'] };
  for (const place of ['sofa', 'city', 'road']) TV.rank(pack, D, ctx({ place })).items.forEach(i => {
    const s = pack.byId[i.scenario_id]; assert.ok(!s.tags.includes('photo')); assert.equal(s.cost, 0); assert.ok(!(s.excludes_if || []).includes('mobility'));
  });
});

test('дефицит: пустая сторона выше заполненной', () => {
  const D = fresh(); const full = { body: 1, hands: 1, mind: 1, people: 1, world: 1, quiet: 0 };
  const r = TV.rank(pack, D, ctx({ fill: full }), { jitter: 0 });
  const top = r.items.slice(0, 5).map(i => i.sector); assert.ok(top.filter(s => s === 'quiet').length >= 3, top.join(','));
  assert.equal(r.items.find(i => i.sector === 'quiet').features.deficit, 1);
});

test('balance: yes = 1, partly = 0.5, недостающие стороны', () => {
  const D = fresh(); const body = pack.scenarios.find(s => s.sector === 'body').id; const mind = pack.scenarios.find(s => s.sector === 'mind').id;
  done(D, body, 'yes'); done(D, mind, 'partly'); done(D, mind, 'no', null);
  const b = TV.todayBalance(pack, D); assert.equal(b.done.body, 1); assert.equal(b.done.mind, 0.5); assert.equal(b.fill.mind, 0.5);
  assert.equal(b.total, 1.5); assert.equal(b.moves.length, 2); assert.ok(b.missing.includes('quiet') && !b.missing.includes('body'));
});

test('два «не люблю» скрывают ход, «не могу сейчас» — нет', () => {
  const D = fresh(); const [a, b] = ids(TV.rank(pack, D, ctx(), { jitter: 0 }));
  for (const reason of ['dislike', 'dislike']) { const o = offer(D, a, 5 * 86400000); D.responses.push(TV.stamp({ offer_id: o.id, action: 'declined', decline_reason: reason })); }
  for (const reason of ['cant_now', 'cant_now', 'cant_now']) { const o = offer(D, b, 5 * 86400000); D.responses.push(TV.stamp({ offer_id: o.id, action: 'declined', decline_reason: reason })); }
  const r = TV.rank(pack, D, ctx()); assert.equal(r.excluded[a], 'disliked'); assert.ok(r.items.find(i => i.scenario_id === b));
});

test('«стало лучше» поднимает ход, недавний показ — опускает', () => {
  const D = fresh(); const c = ctx(); const base = TV.rank(pack, D, c, { jitter: 0 }).items; const target = base[base.length - 1].scenario_id;
  for (let k = 0; k < 3; k++) done(D, target, 'yes', 'better', Date.now() - 10 * 86400000);
  const after = TV.rank(pack, D, c, { jitter: 0 }).items; assert.ok(after.findIndex(i => i.scenario_id === target) < base.findIndex(i => i.scenario_id === target));
  const top = after[0].scenario_id; offer(D, top, 60000);
  assert.ok(TV.rank(pack, D, c, { jitter: 0 }).items.find(i => i.scenario_id === top).score < after[0].score);
});

test('pick: соседние ходы из разных сторон, исследование помечается', () => {
  const D = fresh(); const r = TV.rank(pack, D, ctx());
  const deck = TV.pick(r, 6, { rng: () => 0.99 }); assert.equal(deck.length, 6);
  for (let i = 1; i < deck.length; i++) assert.notEqual(deck[i].category, deck[i - 1].category);
  assert.equal(deck[1].features.explore, 0);
  const ex = TV.pick(r, 2, { rng: () => 0.01 }); assert.equal(ex[1].features.explore, 1);
});

test('вариант по силам и времени', () => {
  assert.equal(TV.variantFor(pack.byId.two_pages, { energy: 1 }).key, 'low_energy');
  assert.equal(TV.variantFor(pack.byId.three_odd_details, { energy: 2, time: 3 }).key, 'short');
  assert.equal(TV.variantFor(pack.byId.three_odd_details, { energy: 2, time: 30 }).key, 'default');
});

test('блокировка пользователем', () => {
  const D = fresh(); const id = ids(TV.rank(pack, D, ctx()))[0]; D.prefs[id] = { blocked: true };
  assert.equal(TV.rank(pack, D, ctx()).excluded[id], 'blocked');
});

test('где человек по умолчанию', () => {
  const wd = new Date(2026, 9, 21, 11, 0).getTime(), road = new Date(2026, 9, 21, 18, 0).getTime(), we = new Date(2026, 9, 25, 11, 0).getTime();
  assert.equal(TV.guessPlace(wd, null), 'work'); assert.equal(TV.guessPlace(road, null), 'road'); assert.equal(TV.guessPlace(we, null), 'sofa');
  assert.equal(TV.guessPlace(wd, { works_outside: false }), 'sofa');
});

test('валидатор ловит ошибки', () => {
  const bad = JSON.parse(JSON.stringify(pack)); delete bad.byId; delete bad.flowsById;
  bad.scenarios[0].fallback_id = 'nope'; bad.scenarios[1].places = ['moon'];
  bad.scenarios.push(Object.assign({}, bad.scenarios.find(s => s.sector === 'shift'), { id: 'bad_shift', variants: [{ key: 'default', text: 'Твоя награда — ещё одна банка' }] }));
  const errs = TV.validatePack(bad).join('\n');
  assert.match(errs, /fallback nope/); assert.match(errs, /неизвестное место moon/); assert.match(errs, /запрещённая формулировка/);
});

test('подстановка текста', () => {
  assert.equal(TV.fill('«{title}» в {time}', { title: 'Чай', time: '19:00' }), '«Чай» в 19:00');
});
