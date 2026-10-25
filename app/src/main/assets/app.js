// Трезвый вечер 1.2 — «Равновесие». Одна линия дня: отметки, тяга, ходы и планы живут на ней,
// в точке «сейчас» — карточка следующего хода, подобранная по месту и недобранной стороне равновесия.
'use strict';
const APP_VERSION = '1.2.0';
const HAS = typeof Android !== 'undefined';

// ---------- хранилище ----------
let D = { entries: [], reasons: [], reminders: [
  { t: '10:00', k: 'morning', on: true }, { t: '16:30', k: 'afternoon', on: true }, { t: '19:00', k: 'evening', on: true }, { t: '22:30', k: 'night', on: true }],
  ritual: ['Закрыть рабочие приложения', 'Переодеться или душ'] };
try { const s = HAS ? Android.load() : localStorage.getItem('d'); if (s) D = Object.assign(D, JSON.parse(s)); } catch (e) {}
D = TV.migrate(D);
function save() { const s = JSON.stringify(D); HAS ? Android.save(s) : localStorage.setItem('d', s); }

const PACK = (function () {
  let txt = null;
  try { if (HAS && Android.asset) txt = Android.asset('content/core-ru.json'); } catch (e) {}
  if (!txt) { const x = new XMLHttpRequest(); x.open('GET', 'content/core-ru.json', false); x.send(); txt = x.responseText; }
  const p = JSON.parse(txt); const errs = TV.validatePack(p);
  if (errs.length) console.error('JSERROR content pack invalid: ' + errs.slice(0, 3).join('; '));
  return TV.indexPack(p);
})();
const LBL = {}; for (const k of ['sectors', 'places', 'decline_reasons', 'tags', 'constraints', 'categories']) { LBL[k] = {}; (PACK.taxonomy[k] || []).forEach(x => LBL[k][x.key] = x.label); }
const SECT = TV.SECTORS;
const SC = s => `var(--s-${s})`;

// ---------- утилиты ----------
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dayKey = ts => TV.localDate(ts);
const today = () => dayKey(Date.now());
const fmtT = ts => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtD = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });
const fmtDs = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = (arr, id) => arr.find(x => x.id === id);
const ev = (type, entity, id, payload) => TV.logEvent(D, type, entity, id, payload, Date.now(), APP_VERSION);
const respFor = offerId => D.responses.filter(r => r.offer_id === offerId && !r.deleted_at);
const fbFor = offerId => D.feedback.find(f => f.offer_id === offerId && !f.deleted_at);
const scenOf = offerId => { const o = byId(D.offers, offerId); return o && PACK.byId[o.scenario_id]; };
const hm2min = t => { const [h, m] = String(t || '19:00').split(':').map(Number); return h * 60 + (m || 0); };
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2400); }

// ---------- справочники дневника ----------
const WANTS = [['silence', 'тишины'], ['alone', 'чтобы не трогали'], ['stopthink', 'перестать думать'], ['pleasure', 'удовольствия'], ['reward', 'награды за день'], ['tired', 'просто устал'], ['drunk', 'именно опьянения'], ['other', 'другое']];
const WANT2SECT = { silence: ['quiet'], alone: ['quiet'], stopthink: ['body', 'hands'], pleasure: ['mind', 'world'], reward: ['hands', 'body'], tired: ['body', 'quiet'], drunk: ['quiet', 'body'] };
const TRIG = [['thought', 'мысль о вечере'], ['time', 'время суток'], ['stress', 'напряжение'], ['duty', 'много обязанностей'], ['family', 'шум, дети, дом'], ['bored', 'скука'], ['sad', 'хмуро'], ['shop', 'вижу магазин'], ['other', 'другое']];
const CP = { morning: 'Утро', afternoon: 'День', evening: 'Вечерний перерыв', night: 'Итог дня' };
const REM = { morning: 'Утро', plan: 'План вечера', afternoon: 'День', pre: 'Перед вечером', evening: 'Вечерний перерыв', night: 'Итог дня' };
const ICON = {
  now: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  diary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 4v16M6 7h12M6 12h9M6 17h11"/></svg>',
  balance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9" opacity=".5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>'
};

// ---------- серии ----------
function dayInfo() {
  const m = {};
  for (const e of D.entries) { const k = dayKey(e.ts); m[k] = m[k] || { cp: new Set(), drank: null, cravings: 0 };
    if (e.type === 'checkin') { m[k].cp.add(e.kind); if (e.kind === 'night' && e.drank != null) m[k].drank = e.drank; }
    if (e.type === 'craving') m[k].cravings++; }
  return m;
}
function streaks() {
  const m = dayInfo(); let sober = 0, check = 0; const d = new Date();
  if (!(m[today()] && m[today()].drank != null)) d.setDate(d.getDate() - 1);
  while (true) { const k = dayKey(d); if (m[k] && m[k].drank === false) { sober++; d.setDate(d.getDate() - 1); } else break; }
  const d3 = new Date(); if (!(m[today()] && m[today()].cp.size)) d3.setDate(d3.getDate() - 1);
  while (true) { const k = dayKey(d3); if (m[k] && m[k].cp.size) { check++; d3.setDate(d3.getDate() - 1); } else break; }
  let best = 0, cur = 0; const keys = Object.keys(m).sort();
  if (keys.length) { const s = new Date(keys[0]); const e = new Date(); for (; s <= e; s.setDate(s.getDate() + 1)) { const x = m[dayKey(s)]; if (x && x.drank === false) { cur++; best = Math.max(best, cur); } else cur = 0; } }
  return { sober, check, best };
}

// ================= ПРОАКТИВНЫЕ НАПОМИНАНИЯ =================
function plannedList(dateKey) {
  return D.responses.filter(r => r.action === 'planned' && !r.deleted_at && !r.cancelled && r.planned_for && (!dateKey || dayKey(r.planned_for) === dateKey))
    .filter(r => !respFor(r.offer_id).some(x => x.action === 'accepted' && x.created_at > r.created_at)).sort((a, b) => a.planned_for - b.planned_for);
}
function syncProactive() {
  if (!HAS || !Android.setProactive) return;
  const p = plannedList(today())[0];
  Android.setProactive(JSON.stringify({ max: D.proactive.max_daily, quiet_from: D.proactive.quiet_from, quiet_to: D.proactive.quiet_to, planned_date: p ? today() : '' }));
}
function schedulePrompt(kind, at, title, text, screen, proactive, refs) {
  const p = TV.stamp(Object.assign({ kind, fire_at: at, status: 'scheduled', title, text, screen, proactive: !!proactive }, refs || {}));
  D.prompts.push(p); ev('prompt_scheduled', 'prompt', p.id, { kind, fire_at: at });
  if (HAS && Android.scheduleOnce) Android.scheduleOnce(p.id, at, title, text, screen, !!proactive);
  return p;
}
function cancelPrompts(pred) {
  D.prompts.filter(p => p.status === 'scheduled' && pred(p)).forEach(p => { p.status = 'cancelled'; TV.touch(p); if (HAS && Android.cancelOnce) Android.cancelOnce(p.id); ev('prompt_cancelled', 'prompt', p.id, {}); });
}
function refreshPrompts() {
  const now = Date.now();
  D.prompts.forEach(p => { if (p.status === 'scheduled' && p.fire_at <= now) { p.status = 'fired'; TV.touch(p); } else if (p.status === 'scheduled' && HAS && Android.scheduleOnce) Android.scheduleOnce(p.id, p.fire_at, p.title, p.text, p.screen, !!p.proactive); });
}

// ================= СОСТОЯНИЕ «СЕЙЧАС» =================
const UI = { tab: 'now', stack: [], deck: [], idx: 0, deckKey: null, session: null, then: [], energy: null, trigger: 'loop', planTime: null, cardState: null, stepOn: {}, note: '' };
function currentPlace() { return D.now.place && Date.now() - D.now.place_ts < 6 * 3600000 ? D.now.place : TV.guessPlace(Date.now(), D.profile); }
function setPlace(p, source) {
  if (D.now.place === p && Date.now() - D.now.place_ts < 6 * 3600000) return;
  D.now.place = p; D.now.place_ts = Date.now();
  D.places_log.push(TV.stamp({ ts: Date.now(), place: p, source: source || 'manual' }));
  ev('place', 'store', D.install_id, { place: p, source }); save();
}
function lastCraving() {
  const e = [...D.entries].reverse().find(x => x.type === 'craving' && !x.deleted_at);
  return e && Date.now() - e.ts < 45 * 60000 && !e.outcome ? e : null;
}
const intoxToday = () => D.now.intox_date === today();
const shiftToday = () => D.now.shift_date === today();
function mode() { return shiftToday() ? 'shift' : (D.now.mode === 'plan' ? 'plan' : 'now'); }
function canGoOut(hour) {
  if (intoxToday()) return false;
  const p = D.profile || {};
  if (p.can_leave_home_evening === 'no' && hour >= 18) return false;
  if (p.care_duties === 'kids' && hour >= 20) return false;
  return true;
}
function planHour() { const t = UI.planTime || (D.profile && D.profile.usual_drink_time) || '19:00'; return Math.floor(hm2min(t) / 60); }
function ctxNow() {
  const m = mode(); const now = new Date(); const cr = lastCraving(); const bal = TV.todayBalance(PACK, D);
  const hour = m === 'plan' ? planHour() : now.getHours();
  const want = cr && (cr.wants || []).flatMap(w => WANT2SECT[w] || []);
  return { place: m === 'plan' ? null : currentPlace(), mode: m, hour, weekday: now.getDay(), craving: cr ? cr.intensity : 0, intoxicated: intoxToday(),
    can_go_out: canGoOut(hour), want_sectors: want || [], then_ids: UI.then, energy: UI.energy,
    dwell_min: D.now.place && D.now.place === currentPlace() ? Math.round((Date.now() - D.now.place_ts) / 60000) : 0,
    load: TV.dayLoad(D), fill: bal.fill };
}
function deckKey(c) { return JSON.stringify([c.place, c.mode, c.hour, c.craving >= 7 ? 2 : c.craving >= 4 ? 1 : 0, c.intoxicated, c.want_sectors, c.then_ids, c.energy]); }
function endSession(outcome) {
  const s = UI.session; if (!s || s.ended_at) return;
  s.ended_at = Date.now(); s.outcome = outcome; TV.touch(s); ev('session_ended', 'session', s.id, { outcome });
}
function buildDeck(force) {
  const c = ctxNow(); const key = deckKey(c);
  if (!force && key === UI.deckKey && UI.idx < UI.deck.length) return;
  endSession('redirected');
  const shown = UI.session && force ? D.offers.filter(o => o.session_id === UI.session.id).map(o => o.scenario_id) : [];
  const s = TV.stamp({ trigger: UI.trigger, flow_id: 'balance', flow_revision: 1, pack_id: PACK.pack_id, pack_version: PACK.version, started_at: Date.now(), ended_at: null,
    context: Object.assign({}, c, { fill: undefined }), craving_entry_id: (lastCraving() || {}).id || null, checkpoint_id: null, outcome: null });
  D.sessions.push(s); UI.session = s; ev('session_started', 'session', s.id, { trigger: s.trigger, place: c.place, mode: c.mode });
  UI.trigger = 'loop';
  const ranked = TV.rank(PACK, D, c, { exclude_ids: shown });
  UI.ranked = ranked; UI.deck = TV.pick(ranked, 14).map(p => ({ pick: p, offer: null })); UI.idx = 0; UI.deckKey = key; UI.ctx = c;
  save();
}
function currentCard() {
  const a = D.now.active && byId(D.offers, D.now.active.offer_id);
  if (a && !fbFor(a.id)) return { offer: a, active: true };
  if (D.now.active) { D.now.active = null; save(); }
  buildDeck(false);
  if (UI.idx >= UI.deck.length) buildDeck(true);
  const it = UI.deck[UI.idx]; if (!it) return null;
  if (!it.offer) {
    const p = it.pick;
    const o = TV.stamp({ session_id: UI.session.id, node_id: 'deck', scenario_id: p.scenario_id, scenario_revision: p.scenario_revision, variant_key: p.variant_key,
      position: UI.idx, ranker_id: UI.ranked.ranker_id, score: p.score, features: p.features, context: Object.assign({}, UI.ctx, { fill: undefined }), shown_at: Date.now() });
    D.offers.push(o); it.offer = o; ev('offer_shown', 'offer', o.id, { scenario: p.scenario_id, score: p.score }); save();
  }
  return { offer: it.offer, active: false };
}
function respond(offerId, action, extra) {
  const r = TV.stamp(Object.assign({ offer_id: offerId, action, decline_reason: null, planned_for: null, responded_at: Date.now() }, extra || {}));
  D.responses.push(r); ev('offer_' + action, 'offer', offerId, extra || {}); return r;
}
// Почему предложен этот ход — человеческим языком
function whyText(o, s) {
  const f = o.features || {};
  if (s.sector === 'shift') return 'Не уговариваю. Просто одно изменение в привычном вечере.';
  if (f.chain) return 'Хорошо продолжает то, что ты только что сделал.';
  if (f.transition && f.dwell_min >= 40) return `Ты здесь уже ${f.dwell_min >= 90 ? 'давно' : 'около часа'}. Смени точку.`;
  if (f.want) return 'Похоже на то, чего сейчас хочется.';
  if (f.craving >= 5) return 'Тянет — нужен короткий ход, который занимает тело или руки.';
  if (f.mode === 'plan') return `Вечером в ${UI.planTime || (D.profile && D.profile.usual_drink_time) || '19:00'} — заранее, пока решение не принято.`;
  if (f.deficit >= 1) return `Сегодня ещё не было стороны «${LBL.sectors[s.sector]}».`;
  if (f.better_w > 0.5) return 'Раньше после такого становилось лучше.';
  if (f.explore) return 'Ты такого ещё не пробовал.';
  return `Сторона «${LBL.sectors[s.sector]}»: ${PACK.taxonomy.sectors.find(x => x.key === s.sector).hint}.`;
}

// ================= ДЕЙСТВИЯ С КАРТОЧКОЙ =================
function swapCard(after) {
  const el = document.querySelector('.mv');
  if (!el || reduced()) { after(); renderNow(); return; }
  el.classList.add('out');
  setTimeout(() => { after(); renderNow(true); }, 200);
}
window.mvNext = () => swapCard(() => { const c = currentCard(); if (c && !c.active) respond(c.offer.id, 'skipped'); UI.idx++; save(); });
window.mvDo = (offerId) => {
  respond(offerId, 'accepted'); const s = scenOf(offerId);
  D.now.active = { offer_id: offerId, started_at: Date.now() }; UI.stepOn = {}; UI.note = ''; UI.cardState = null;
  if (D.proactive.followups && s) { cancelPrompts(p => p.kind === 'followup' && p.offer_id === offerId);
    schedulePrompt('followup', Date.now() + (s.duration_max + 5) * 60000, 'Как прошло?', s.followup.question, 'fb:' + offerId, true, { offer_id: offerId }); }
  save(); renderNow(false, true);
};
window.mvStep = i => { UI.stepOn[i] = !UI.stepOn[i]; const li = document.querySelector(`.steps li[data-i="${i}"]`); li && li.classList.toggle('on', !!UI.stepOn[i]); };
window.mvFinish = () => { UI.cardState = 'result'; renderNow(false, true); };
window.mvDrop = (offerId) => { storeFeedback(offerId, { tried: 'partly', result: null }); D.now.active = null; UI.then = []; save(); toast('Бросить — тоже нормально. Это всё равно ход.'); swapCard(() => {}); };
window.mvResult = (offerId, result) => {
  const s = scenOf(offerId);
  const note = ($('mvnote') && $('mvnote').value) || UI.note || null;
  storeFeedback(offerId, { tried: 'yes', result, note });
  D.now.active = null; UI.cardState = null; UI.energy = null;
  UI.then = (s && s.then) || [];
  if (s && s.to) setPlace(s.to, 'move');
  endSession('completed'); UI.deckKey = null; save();
  flyToWheel(s ? s.sector : 'quiet', () => { renderTop(true); renderLine(); });
  swapCard(() => {});
};
function storeFeedback(offerId, f) {
  cancelPrompts(p => p.kind === 'followup' && p.offer_id === offerId);
  const prompt = D.prompts.filter(p => p.offer_id === offerId && p.kind === 'followup').pop();
  const fb = TV.stamp(Object.assign({ offer_id: offerId, tried: null, result: null, craving_after: null, drank_tonight: null, cans: null, note: null,
    asked_at: prompt ? prompt.fire_at : Date.now(), answered_at: Date.now(), source: 'card' }, f));
  D.feedback.push(fb); ev('feedback', 'offer', offerId, { tried: fb.tried, result: fb.result });
  const cr = lastCraving(); if (cr && fb.tried === 'yes') { fb.craving_before = cr.intensity; }
  return fb;
}
window.mvMore = offerId => {
  const s = scenOf(offerId); const pr = D.prefs[s.id] || {};
  openSheet(() => `<h2>${esc(s.title)}</h2><div class="sub">Почему не подходит? Это помогает подбирать точнее.</div>
    <div class="opts o1" style="margin-top:14px">${PACK.taxonomy.decline_reasons.map(r => `<button class="opt" onclick="mvDecline('${offerId}','${r.key}')">${esc(r.label)}</button>`).join('')}</div>
    <div class="btns"><button onclick="togglePref('${s.id}','favorite')">${pr.favorite ? '★ В избранном' : '☆ В избранное'}</button><button class="ghost" onclick="togglePref('${s.id}','blocked');closeSheet();mvNext()">Не предлагать</button></div>`);
};
window.mvDecline = (offerId, reason) => {
  closeSheet(); const s = scenOf(offerId);
  swapCard(() => {
    respond(offerId, 'declined', { decline_reason: reason });
    if (reason === 'too_hard') { UI.energy = 1; UI.deckKey = null; return; }
    UI.idx++;
    if (reason === 'cant_now' && s.fallback_id && PACK.byId[s.fallback_id]) {
      const fb = TV.rank(PACK, D, Object.assign({}, UI.ctx, { place: null }), {}).items.find(i => i.scenario_id === s.fallback_id);
      if (fb) UI.deck.splice(UI.idx, 0, { pick: Object.assign({}, fb, { features: Object.assign({}, fb.features, { fallback: 1, explore: 0 }) }), offer: null });
    }
    save();
  });
};
window.togglePref = (sid, field) => { const p = D.prefs[sid] = D.prefs[sid] || {}; p[field] = !p[field]; p.updated_at = Date.now(); ev('pref_' + field, 'scenario', sid, { value: p[field] }); save(); refreshSheet(); if (UI.tab === 'library') render(); };
window.mvLater = offerId => {
  const opts = [['+60', 'Через час'], ['19:00', 'В 19:00'], ['20:00', 'В 20:00'], ['21:00', 'В 21:00']];
  openSheet(() => `<h2>Когда напомнить?</h2><div class="sub">Ход появится на линии дня, а в это время придёт напоминание.</div>
    <div class="opts" style="margin-top:14px">${opts.map(([v, l]) => `<button class="opt" onclick="mvPlan('${offerId}','${v}')">${l}</button>`).join('')}</div>
    <label class="f">Или своё время</label><div class="btns c2" style="margin-top:0"><input type="time" id="plt" value="${esc(UI.planTime || (D.profile && D.profile.usual_drink_time) || '19:00')}"><button class="pri" onclick="mvPlan('${offerId}',$('plt').value)">Запланировать</button></div>`);
};
window.mvPlan = (offerId, val) => {
  let at; if (String(val).startsWith('+')) at = Date.now() + (+val.slice(1)) * 60000;
  else { const m = hm2min(val); const d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0); if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1); at = d.getTime(); }
  const s = scenOf(offerId); const r = respond(offerId, 'planned', { planned_for: at });
  schedulePrompt('plan_reminder', at, 'Твой ход: ' + s.title, TV.variantFor(s, {}).text, 'do:' + offerId, false, { offer_id: offerId, response_id: r.id });
  syncProactive(); closeSheet(); save(); toast(`В плане на ${fmtT(at)}: ${s.title}`);
  swapCard(() => { UI.idx++; });
  setTimeout(renderLine, 260);
};
window.planHere = offerId => { const t = ($('pltc') && $('pltc').value) || '19:00'; UI.planTime = t; mvPlan(offerId, t); };
window.cancelPlan = rid => { const r = byId(D.responses, rid); r.cancelled = true; TV.touch(r); cancelPrompts(p => p.response_id === rid); ev('plan_cancelled', 'response', rid, {}); syncProactive(); save(); renderLine(); };
window.startPlanned = offerId => { mvDo(offerId); scrollToNow(); renderLine(); };
window.setMode = m => { D.now.mode = m; if (m !== 'shift' && shiftToday() && m === 'now') { /* остаёмся в shift только явно */ } save(); UI.deckKey = null; renderNow(true); };
window.pickPlace = p => { setPlace(p, 'manual'); UI.then = []; UI.deckKey = null;
  document.querySelectorAll('.places .chip').forEach(c => c.classList.toggle('on', c.dataset.p === p));
  const el = document.querySelector(`.places .chip[data-p="${p}"]`); el && el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  swapCard(() => {}); renderLine(); };
window.toggleIntox = on => { D.now.intox_date = on ? today() : null; ev('intoxicated', 'store', D.install_id, { on }); save(); UI.deckKey = null; swapCard(() => {}); };
window.stillDrink = () => { D.now.shift_date = today(); D.now.intox_date = D.now.intox_date || null; ev('still_drink', 'store', D.install_id, {}); save(); UI.trigger = 'still_drink'; UI.deckKey = null;
  toast('Понял. Уговаривать не буду — давай изменим хотя бы одну вещь.'); swapCard(() => {}); };
window.leaveShift = () => { D.now.shift_date = null; D.now.mode = 'now'; save(); UI.deckKey = null; swapCard(() => {}); };

// ---------- тяга прямо на линии ----------
let cravingTimer = null;
window.pullInput = v => { $('pullv').textContent = v; $('wants').classList.toggle('open', +v > 0); };
window.pullSet = v => {
  v = +v; let e = lastCraving();
  if (!v && !e) return;
  if (!e) { e = { id: uid(), ts: Date.now(), type: 'craving', intensity: v, wants: [], triggers: [], note: '', audio: [], created_at: Date.now(), updated_at: Date.now(), deleted_at: null, sync_state: 'local', local_date: today() };
    D.entries.push(e); ev('craving', 'entry', e.id, { intensity: v }); }
  else { e.intensity = v; e.updated_at = Date.now(); }
  if (!v) { e.outcome = 'passed'; e.outcomeTs = Date.now(); }
  UI.trigger = 'craving'; UI.deckKey = null; save();
  $('wants').classList.toggle('open', v > 0);
  $('pullwarn').innerHTML = v >= 8 ? '<div class="warn" style="margin-top:8px">Сильная тяга — отметь это для врача-нарколога. Ты не обязан справляться только силой воли: есть препараты, снижающие тягу, их подбирает врач.</div>' : '';
  swapCard(() => {}); renderTop(); renderLine();
};
window.wantTog = (field, k, el) => { const e = lastCraving(); if (!e) return; const a = e[field]; const i = a.indexOf(k); i < 0 ? a.push(k) : a.splice(i, 1); el.classList.toggle('on'); e.updated_at = Date.now(); save();
  if (field === 'wants') { UI.deckKey = null; clearTimeout(cravingTimer); cravingTimer = setTimeout(() => swapCard(() => {}), 500); } };
window.cravingOut = (id, o) => { const e = D.entries.find(x => x.id === id); if (!e) return; e.outcome = o; e.outcomeTs = Date.now(); save(); UI.deckKey = null;
  toast(o === 'passed' ? 'Отлично. Запомни, что сработало.' : 'Записано, без самобичевания. Это данные, а не приговор.');
  if (o === 'drank') D.now.intox_date = today(); save(); renderNow(true); };

// ---------- полёт точки в колесо ----------
function flyToWheel(sector, done) {
  const from = document.querySelector('.mv'); const to = document.querySelector(`.wheel .petal[data-s="${sector}"]`) || document.querySelector('.wheel');
  if (!from || !to || reduced() || !document.body.animate) { done(); return; }
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const d = document.createElement('div'); d.className = 'flyer'; d.style.background = SC(sector); document.body.appendChild(d);
  const x0 = a.left + a.width / 2, y0 = a.top + 40, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  const an = d.animate([{ transform: `translate(${x0}px,${y0}px) scale(1.4)`, opacity: 1 }, { transform: `translate(${(x0 + x1) / 2 + 40}px,${Math.min(y0, y1) - 60}px) scale(1)`, opacity: 1 }, { transform: `translate(${x1}px,${y1}px) scale(.5)`, opacity: .3 }],
    { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)' });
  d.style.left = '-9px'; d.style.top = '-9px';
  an.onfinish = () => { d.remove(); done(); };
}

// ================= ОТРИСОВКА =================
const NAV = [['now', 'Сейчас'], ['diary', 'Дневник'], ['balance', 'Баланс'], ['settings', 'Настройки']];
const TABS = { history: 'diary', stats: 'balance', home: 'now' };
function tab(t, back) { t = TABS[t] || t; UI.tab = t; UI.stack = []; render(back); window.scrollTo(0, 0); }
function go(screen, params) { UI.stack.push({ screen, params: params || {} }); render(); window.scrollTo(0, 0); }
function render(back) {
  const top = UI.stack[UI.stack.length - 1]; const screen = top ? top.screen : UI.tab;
  $('nav').style.display = D.onboarded_at || location.search.includes('selftest') ? '' : 'none';
  $('nav').innerHTML = NAV.map(([k, l]) => `<button class="${UI.tab === k ? 'on' : ''}" onclick="tab('${k}')">${ICON[k]}<span>${l}</span></button>`).join('');
  const app = $('app'); app.innerHTML = `<div class="view${back ? ' back' : ''}">${V[screen](top ? top.params : {})}</div>`;
  if (V[screen + '_after']) V[screen + '_after'](top ? top.params : {});
}
window.goBack = () => {
  stopTimer(); if (rec) stopRec();
  if (SHEET.open) { closeSheet(); return 'ok'; }
  if (UI.stack.length) { UI.stack.pop(); render(true); return 'ok'; }
  if (UI.tab !== 'now') { tab('now', true); return 'ok'; }
  return 'exit';
};
const V = {};

// ---------- колесо ----------
function wedge(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)].map(n => n.toFixed(2)).join(' ');
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
}
function wheelSvg(fill, opts) {
  opts = opts || {}; const R = opts.small ? 62 : 50, r0 = 12, C = 70;
  let h = '';
  SECT.forEach((s, i) => {
    const a = -90 + i * 60; const d = wedge(C, C, r0, R, a - 27, a + 27); const f = fill[s] || 0; const k = f > 0 ? 0.42 + 0.58 * f : 0.0001;
    h += `<path class="petal-bg" d="${d}" fill="${SC(s)}"/><path class="petal" data-s="${s}" d="${d}" fill="${SC(s)}" style="transform:scale(${opts.from ? 0.0001 : k})" data-k="${k}"/>`;
    if (!opts.small) { const lx = C + (R + 13) * Math.cos(a * Math.PI / 180), ly = C + (R + 13) * Math.sin(a * Math.PI / 180); h += `<text class="wl ${f > 0 ? 'has' : ''}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${LBL.sectors[s]}</text>`; }
  });
  return `<svg viewBox="0 0 140 140" width="100%" height="100%">${h}</svg>`;
}
function animateWheel(root) { requestAnimationFrame(() => requestAnimationFrame(() => (root || document).querySelectorAll('.petal').forEach(p => p.style.transform = `scale(${p.dataset.k})`))); }
function plural(n, a, b, c) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; }
function topHtml(anim) {
  const bal = TV.todayBalance(PACK, D); const got = SECT.filter(s => bal.fill[s] > 0).length; const st = streaks(); const load = TV.dayLoad(D);
  const miss = bal.missing.map(s => LBL.sectors[s]);
  const msg = got === 0 ? 'День пока пустой. Один маленький ход — и колесо начнёт заполняться.'
    : got === 6 ? 'Все шесть сторон. Сегодня ты себя не обделил.'
    : `Не хватает: ${miss.slice(0, 3).join(', ')}${miss.length > 3 ? '…' : ''}`;
  return `<div class="wheel" id="wheel">${wheelSvg(bal.fill, { from: anim })}</div>
   <div class="topinfo"><div class="eq"><b>${got}</b>из 6 сторон</div><div class="miss">${esc(msg)}</div>
   ${load != null ? `<div class="stk">Нагрузка дня ${load}/10</div><div class="loadbar"><div style="width:${load * 10}%"></div></div>` : ''}
   <div class="stk">${st.sober} ${plural(st.sober, 'вечер', 'вечера', 'вечеров')} без пива · лучшая серия ${st.best}</div></div>`;
}
function renderTop(pulse) { const el = $('top'); if (!el) return; el.innerHTML = topHtml(true); animateWheel(el); if (pulse) { const w = $('wheel'); w.classList.remove('pulse'); void w.offsetWidth; w.classList.add('pulse'); } }

function placesLbl(ps) {
  const home = ['sofa', 'room', 'kitchen', 'bath', 'window']; const all = home.every(h => ps.includes(h));
  const rest = ps.filter(q => !all || !home.includes(q)).map(q => LBL.places[q]);
  return (all ? ['Где угодно дома'] : []).concat(rest).join(', ');
}
// ---------- линия дня ----------
function lineItems(dk, withFuture) {
  const items = []; const now = Date.now();
  for (const e of D.entries) {
    if (e.deleted_at || dayKey(e.ts) !== dk) continue;
    if (e.type === 'checkin') items.push({ ts: e.ts, color: 'var(--acc)', html: `<b>${CP[e.kind]}</b> · ${checkinSummary(e)}`, onclick: `openEntry('${e.id}')` });
    if (e.type === 'craving') items.push({ ts: e.ts, color: 'var(--bad)', html: `<b>Тянуло ${e.intensity}/10</b>${e.wants.length ? ' · хотел ' + esc(lbl(WANTS, e.wants)) : ''}${e.outcome ? ` · ${e.outcome === 'passed' ? 'отпустило' : 'выпил'}` : ''}`,
      acts: !e.outcome && dk === today() ? `<button class="tiny" onclick="cravingOut('${e.id}','passed')">Отпустило</button><button class="tiny ghost" onclick="cravingOut('${e.id}','drank')">Выпил</button>` : '', onclick: `openEntry('${e.id}')` });
    if (e.type === 'voice') items.push({ ts: e.ts, color: 'var(--mut)', html: `<b>Голосом</b>${e.note ? ' · «' + esc(e.note.slice(0, 60)) + '»' : ''}`, onclick: `openEntry('${e.id}')` });
  }
  const [a, b] = TV.dayBounds(new Date(dk + 'T12:00:00').getTime());
  for (const m of TV.balance(PACK, D, a, b).moves) {
    const s = PACK.byId[m.scenario_id];
    items.push({ ts: m.ts, color: SC(m.sector), html: `<b>${esc(s.title)}</b> · ${LBL.sectors[m.sector]}${m.w < 1 ? ' · частично' : ''}${m.result ? ' · ' + ({ better: 'стало лучше', same: 'так же', worse: 'хуже' }[m.result]) : ''}`, key: m.offer_id });
  }
  D.places_log.filter(p => dayKey(p.ts) === dk).forEach(p => items.push({ ts: p.ts, place: true, html: `→ ${LBL.places[p.place]}` }));
  // запланированное
  plannedList(dk).forEach(r => { const s = scenOf(r.offer_id); if (!s) return;
    const fut = r.planned_for > now; const due = r.planned_for - now < 15 * 60000;
    items.push({ ts: r.planned_for, future: fut, color: SC(s.sector), html: `<b>В плане: ${esc(s.title)}</b>`,
      acts: dk === today() ? `${due ? `<button class="tiny" onclick="startPlanned('${r.offer_id}')">Начать</button>` : ''}<button class="tiny ghost" onclick="cancelPlan('${r.id}')">Отменить</button>` : '' }); });
  // станции-чекпоинты на сегодня
  if (withFuture) {
    const done = dayInfo()[dk] || { cp: new Set() };
    const missed = [];
    D.reminders.filter(r => CP[r.k] && r.on && !done.cp.has(r.k)).forEach(r => {
      const m = hm2min(r.t); const d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0); const ts = d.getTime();
      if (ts <= now) { missed.push({ k: r.k, ts }); return; }
      items.push({ ts, future: true, color: 'var(--acc)', html: `<b>${CP[r.k]}</b> · отметка`,
        acts: `<button class="tiny" onclick="openCheckin('${r.k}')">Отметить</button>` });
    });
    // пропущенные отметки — одной строкой, чтобы не заслонять «сейчас»
    if (missed.length) items.push({ ts: missed[missed.length - 1].ts, hollow: true, color: 'var(--acc)', missed: true,
      html: `<span class="sub">Можно отметить задним числом</span>`,
      acts: missed.map(x => `<button class="tiny ghost" onclick="openCheckin('${x.k}')">${CP[x.k].split(' ')[0]}</button>`).join('') });
    // давние «как прошло?» без ответа
    D.responses.filter(r => r.action === 'accepted' && !r.deleted_at && Date.now() - r.created_at < 2 * 86400000 && !fbFor(r.offer_id) && !(D.now.active && D.now.active.offer_id === r.offer_id)).forEach(r => {
      const s = scenOf(r.offer_id); if (!s) return;
      items.push({ ts: r.created_at, hollow: true, color: SC(s.sector), html: `<b>${esc(s.title)}</b> · получилось?`,
        acts: `<button class="tiny" onclick="quickTried('${r.offer_id}','yes')">Да</button><button class="tiny" onclick="quickTried('${r.offer_id}','partly')">Частично</button><button class="tiny ghost" onclick="quickTried('${r.offer_id}','no')">Нет</button>` });
    });
  }
  return items.sort((x, y) => x.ts - y.ts);
}
function liHtml(it, isNew) {
  return `<div class="li ${it.future ? 'future' : ''} ${it.place ? 'place' : ''} ${isNew ? 'new' : ''}" ${it.onclick ? `onclick="${it.onclick}"` : ''}>
    <div class="dot ${it.hollow ? 'hollow' : ''}" style="${it.color ? `background:${it.hollow ? 'var(--bg)' : it.color};border-color:${it.color}` : ''}"></div>
    <div><div class="tm">${fmtT(it.ts)}</div><div class="tx">${it.html}</div>${it.acts ? `<div class="acts" onclick="event.stopPropagation()">${it.acts}</div>` : ''}</div></div>`;
}
let seenLine = new Set();
function renderLine() {
  const past = $('past'), fut = $('future'); if (!past) return;
  const items = lineItems(today(), true); const now = Date.now();
  const sig = it => it.ts + '|' + it.html;
  const first = !seenLine.size;
  past.innerHTML = items.filter(i => !i.future && i.ts <= now).map(i => liHtml(i, !first && !seenLine.has(sig(i)))).join('') || '';
  fut.innerHTML = items.filter(i => i.future || i.ts > now).map(i => liHtml(i, !first && !seenLine.has(sig(i)))).join('');
  seenLine = new Set(items.map(sig));
}
function scrollToNow() { const n = $('nownode'); n && n.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }

// ---------- карточка ----------
function cardHtml(c, enter) {
  if (!c) return `<div class="mv ${enter ? 'in' : ''}"><h2>Здесь пока нечего предложить</h2><div class="sub">Смени место или загляни в «Все ходы» в настройках.</div></div>`;
  const o = c.offer; const s = PACK.byId[o.scenario_id]; const ctx = o.context || {}; const v = TV.variantFor(s, ctx); const m = mode();
  const shift = s.sector === 'shift';
  const meta = `<div class="meta"><span class="pill">${esc(shift ? 'Одно изменение' : LBL.sectors[s.sector])}</span><span class="sub">${shift ? '' : `${s.duration_min === s.duration_max ? s.duration_min : s.duration_min + '–' + s.duration_max} мин`}${s.cost ? ' · ' + ['', 'немного денег', 'платно'][s.cost] : ''}${s.to && s.to !== ctx.place ? ' · → ' + LBL.places[s.to] : ''}</span>
    ${c.active ? '' : `<button class="more" onclick="mvMore('${o.id}')" aria-label="Ещё">${ICON.more}</button>`}</div>`;
  const style = `style="--sc:${SC(s.sector)}"`;
  if (!c.active) {
    const acts = m === 'plan'
      ? `<label class="plt"><span class="sub">Во сколько</span><input type="time" id="pltc" value="${esc(UI.planTime || (D.profile && D.profile.usual_drink_time) || '19:00')}" onchange="UI.planTime=this.value"></label><div class="btns c2" style="margin-top:10px"><button onclick="mvNext()">Другое</button><button class="pri" onclick="planHere('${o.id}')">В план</button></div>`
      : `<div class="btns c3"><button onclick="mvNext()">Другое</button><button onclick="mvLater('${o.id}')">Позже</button><button class="pri" onclick="mvDo('${o.id}')">Делаю</button></div>`;
    return `<div class="mv ${shift ? 'shift' : ''} ${enter ? 'in' : ''}" ${style}>${meta}<h2>${esc(s.title)}</h2><div>${esc(v.text)}</div>
      <div class="why"><i></i><span>${esc(whyText(o, s))}</span></div>${acts}</div>`;
  }
  // активный ход
  if (UI.cardState === 'result') {
    return `<div class="mv go" ${style}>${meta}<h2>${esc(s.title)}</h2><div class="sub">${esc(s.followup.question)}</div>
      <div class="res"><button onclick="mvResult('${o.id}','worse')">Хуже</button><button onclick="mvResult('${o.id}','same')">Так же</button><button class="ok" onclick="mvResult('${o.id}','better')">Лучше</button></div></div>`;
  }
  const steps = (v.steps || []).map((x, i) => `<li data-i="${i}" class="${UI.stepOn[i] ? 'on' : ''}" onclick="mvStep(${i})" style="animation-delay:${i * 60}ms"><div class="ck"></div><span>${esc(x)}</span></li>`).join('');
  const dur = Math.max(1, s.action === 'timer' ? s.duration_min : 0);
  return `<div class="mv go" ${style}>${meta}<div class="badge">Делаю</div><h2>${esc(s.title)}</h2><div style="font-size:17px">${esc(v.text)}</div>
    ${steps ? `<ul class="steps">${steps}</ul>` : ''}
    ${s.action === 'timer' ? `<div class="ring" id="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="ringfg" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><b id="ringt">${dur}:00</b></div>
      <div class="btns"><button onclick="ringStart(${dur * 60})">Запустить ${dur} мин</button></div>` : ''}
    ${s.action === 'note' ? `<label class="f">Запиши, что заметил</label><textarea id="mvnote" oninput="UI.note=this.value" placeholder="можно коротко">${esc(UI.note)}</textarea>` : ''}
    ${s.action === 'open_voice' ? `<div class="btns"><button onclick="openVoice()">${ICON.mic} Записать голосом</button></div>` : ''}
    <div class="sub" style="margin-top:12px">${esc(v.stop_permission || '')}</div>
    <div class="btns c2"><button class="ghost" onclick="mvDrop('${o.id}')">Бросил</button><button class="ok" onclick="mvFinish()">Сделал</button></div></div>`;
}
function nowHtml(enter) {
  const m = mode(); const place = currentPlace(); const cr = lastCraving(); const shift = m === 'shift';
  const places = PACK.taxonomy.places.map(p => `<button class="chip ${p.key === place ? 'on' : ''}" data-p="${p.key}" onclick="pickPlace('${p.key}')">${esc(p.label)}</button>`).join('');
  const c = currentCard();
  return `<div class="nowhead">${shift ? `<div class="badge" style="--sc:var(--s-shift)">Вечер с одним изменением</div><button class="link" onclick="leaveShift()">Вернуться</button>`
      : `<div class="seg ${m === 'plan' ? 'r' : ''}"><div class="ind"></div><button class="${m === 'now' ? 'on' : ''}" onclick="setMode('now')">Сейчас</button><button class="${m === 'plan' ? 'on' : ''}" onclick="setMode('plan')">На вечер</button></div>
        <button class="icon" style="height:40px;width:40px;flex:0 0 40px;border-radius:12px" onclick="openVoice()" aria-label="Проговорить">${ICON.mic}</button>`}</div>
    ${m === 'plan' ? `<div class="sub" style="margin-top:8px">Пока решение не принято — выбери ход на вечер. Он встанет на линию, вечером напомню.</div>`
      : `<div class="scroller places" style="margin-top:10px">${places}</div>
    <div class="pull"><span class="sub">Тянет</span><input type="range" min="0" max="10" value="${cr ? cr.intensity : 0}" oninput="pullInput(this.value)" onchange="pullSet(this.value)" aria-label="Насколько тянет выпить"><b id="pullv">${cr ? cr.intensity : 0}</b></div>
    <div class="wants ${cr ? 'open' : ''}" id="wants"><div class="sub" style="margin:4px 0 8px">Чего на самом деле хочется?</div>
      <div class="scroller">${WANTS.map(([k, t]) => `<button class="chip ${cr && cr.wants.includes(k) ? 'on' : ''}" onclick="wantTog('wants','${k}',this)">${t}</button>`).join('')}</div>
      <div class="sub" style="margin:6px 0 8px">Что запустило</div>
      <div class="scroller">${TRIG.map(([k, t]) => `<button class="chip ${cr && cr.triggers.includes(k) ? 'on' : ''}" onclick="wantTog('triggers','${k}',this)">${t}</button>`).join('')}</div>
      <div class="btns" style="margin-top:8px"><button class="ghost" onclick="openWave()">Волна, 10 мин</button><button class="ghost" onclick="openReasons()">Мои причины</button></div></div>
    <div id="pullwarn">${cr && cr.intensity >= 8 ? '<div class="warn" style="margin-top:8px">Сильная тяга — отметь это для врача-нарколога. Ты не обязан справляться только силой воли: есть препараты, снижающие тягу, их подбирает врач.</div>' : ''}</div>`}
    <div id="card">${cardHtml(c, enter)}</div>
    ${m !== 'plan' && !shift ? `<div class="nowlinks"><label class="tgl"><input type="checkbox" class="switch" ${intoxToday() ? 'checked' : ''} onchange="toggleIntox(this.checked)">Уже выпил</label>
      ${cr && cr.intensity >= 5 || intoxToday() ? `<button class="link" onclick="stillDrink()">Всё равно выпью</button>` : ''}</div>` : ''}`;
}
function renderNow(enter, pop) {
  const el = $('nowbody'); if (!el) return;
  el.innerHTML = nowHtml(enter);
  if (pop) { const c = document.querySelector('.mv'); c && c.classList.add('go'); }
}
V.now = () => {
  if (!D.onboarded_at && !location.search.includes('selftest')) return V.welcome();
  return `<div class="top" id="top">${topHtml(true)}</div>
  <div class="line"><div class="daysep">${esc(fmtD(Date.now()))}</div><div id="past"></div>
    <div class="now" id="nownode"><div class="nowdot"></div><div class="nowbody" id="nowbody">${nowHtml(true)}</div></div>
    <div id="future"></div></div>
  ${!D.profile ? `<div class="wrap"><div class="card" onclick="go('profile')"><b>Расскажи о себе за минуту</b><div class="sub">Чтобы не предлагать то, что не подходит.</div></div></div>` : ''}`;
};
V.now_after = () => { if (!D.onboarded_at && !location.search.includes('selftest')) return; seenLine = new Set(); renderLine(); animateWheel($('top')); };

// ---------- таймеры ----------
let TM = null;
function stopTimer() { if (TM) clearInterval(TM); TM = null; }
window.ringStart = sec => { stopTimer(); const end = Date.now() + sec * 1000; const fg = $('ringfg');
  TM = setInterval(() => { const l = Math.max(0, Math.round((end - Date.now()) / 1000)); const t = $('ringt') || $('tm'); if (t) t.textContent = Math.floor(l / 60) + ':' + String(l % 60).padStart(2, '0');
    const g = $('ringfg'); if (g) g.style.strokeDashoffset = (326.7 * (1 - l / sec)).toFixed(1);
    if (!l) { stopTimer(); HAS && Android.vibrate(); if (t) t.textContent = 'Готово'; } }, 500); };
window.startTimer = window.ringStart;
window.openWave = () => openSheet(() => `<h2>Волна тяги</h2><div class="sub">Тяга поднимается и спадает. Десять минут ничего не решай автоматически — побудь с выбранным ходом.</div>
  <div class="ring" id="ring" style="--sc:var(--s-quiet)"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="ringfg" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><b id="ringt">10:00</b></div>
  <div class="btns"><button class="pri" onclick="ringStart(600)">Запустить 10 минут</button></div>`, { onClose: stopTimer });
window.openReasons = () => openSheet(() => `<h2>Мои причины что-то менять</h2>${D.reasons.length ? D.reasons.map(r => `<div class="tip">${esc(r)}</div>`).join('') : '<div class="sub">Пока пусто. Добавь в настройках — они будут здесь, когда тянет.</div>'}`);

// ================= НИЖНЯЯ ПАНЕЛЬ =================
const SHEET = { open: false, fn: null, onClose: null };
function openSheet(fn, opts) {
  const root = $('sheet-root'); SHEET.fn = fn; SHEET.onClose = (opts || {}).onClose || null;
  if (!SHEET.open) { root.innerHTML = `<div class="backdrop" onclick="closeSheet()"></div><div class="sheet" id="sheet"><div class="grab"></div><div id="sheetbody"></div></div>`; }
  $('sheetbody').innerHTML = fn(); SHEET.open = true;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('sheet-open')));
}
function refreshSheet() { if (SHEET.open && SHEET.fn) $('sheetbody').innerHTML = SHEET.fn(); }
function closeSheet() {
  const root = $('sheet-root'); if (!SHEET.open) return; SHEET.open = false; root.classList.remove('sheet-open');
  if (rec) stopRec(); if (SHEET.onClose) SHEET.onClose();
  setTimeout(() => { if (!SHEET.open) root.innerHTML = ''; }, 320);
}
window.closeSheet = closeSheet; window.$ = $;

// ---------- чекпоинты ----------
let F = {};
const ynOpt = (f, a = 'Да', b = 'Нет') => `<div class="opts"><button class="opt ${F[f] === true ? 'on' : ''}" onclick="F.${f}=true;refreshSheet()">${a}</button><button class="opt ${F[f] === false ? 'on' : ''}" onclick="F.${f}=false;refreshSheet()">${b}</button></div>`;
const moodRow = () => `<label class="f">Настроение: <b id="mv">${F.mood}</b>/10</label><input type="range" min="0" max="10" value="${F.mood}" oninput="F.mood=+this.value;$('mv').textContent=this.value">`;
window.openCheckin = k => {
  F = { id: uid(), ts: Date.now(), type: 'checkin', kind: k, mood: 5, note: '', audio: [] };
  if (k === 'night') Object.assign(F, { drank: null, cans: 0, freeTime: null, relief: null, stronger: null });
  if (k === 'morning') Object.assign(F, { plan: '' });
  if (k === 'afternoon') Object.assign(F, { thought: null, load: 5 });
  if (k === 'evening') Object.assign(F, { ritualDone: [], agreed: null });
  openSheet(checkinHtml, { onClose: () => { if (rec) stopRec(); } });
};
function checkinHtml() {
  const k = F.kind; let body = '';
  if (k === 'morning') {
    const y = new Date(); y.setDate(y.getDate() - 1); const yk = dayKey(y.getTime());
    const missed = plannedList(yk).filter(r => !fbFor(r.offer_id));
    body = `<label class="f">Что сегодня потребует больше всего сил?</label><textarea oninput="F.plan=this.value">${esc(F.plan)}</textarea>
    <div class="tip">Подумай заранее: где сегодня будет твой перерыв без дежурства? После отметки можно сразу выбрать ход на вечер.</div>
    ${missed.map(r => { const s = scenOf(r.offer_id); return s ? `<div class="card" style="margin:10px 0 0;background:var(--card2)"><div class="sub">Вчера в плане было</div><b>${esc(s.title)}</b><div class="opts o3" style="margin-top:8px"><button class="opt" onclick="quickTried('${r.offer_id}','yes',this)">Получилось</button><button class="opt" onclick="quickTried('${r.offer_id}','partly',this)">Частично</button><button class="opt" onclick="quickTried('${r.offer_id}','no',this)">Нет</button></div></div>` : ''; }).join('')}`;
  }
  if (k === 'afternoon') body = `<label class="f">Мысль «вечером можно будет выпить» уже появилась?</label>${ynOpt('thought')}
    <label class="f">Насколько я сейчас нагружен: <b id="lv">${F.load}</b>/10</label><input type="range" min="0" max="10" value="${F.load}" oninput="F.load=+this.value;$('lv').textContent=this.value">
    <div class="tip">Если мысль есть — это сигнал, а не приказ. Самое время выбрать ход на вечер, пока решение не принято.</div>`;
  if (k === 'evening') body = `<label class="f">Перерыв дома согласован?</label>${ynOpt('agreed')}
    <label class="f">Ритуал «снять плащ»</label><div class="opts">${D.ritual.map((r, i) => `<button class="opt ${F.ritualDone.includes(r) ? 'on' : ''}" onclick="tg2(${i})">${esc(r)}</button>`).join('')}</div>
    <div class="tip">Когда начинается перерыв — не ищи, чем быть полезным. Выбирай, что приятно, или ничего не делай.</div>`;
  if (k === 'night') {
    const bal = TV.todayBalance(PACK, D);
    body = `<div class="card" style="background:var(--card2);margin:6px 0 0;display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:center"><div style="width:64px">${wheelSvg(bal.fill, { small: true })}</div>
      <div class="sub">Сегодня ходов: ${bal.moves.length}. ${bal.missing.length ? 'Не было: ' + bal.missing.map(s => LBL.sectors[s]).join(', ') + '.' : 'Все стороны.'}</div></div>
    <label class="f">Пил сегодня?</label>${ynOpt('drank', 'Да', 'Нет')}
    <div class="${F.drank ? '' : 'hide'}"><label class="f">Сколько банок</label><input type="number" min="0" value="${F.cans}" oninput="F.cans=+this.value"></div>
    <label class="f">Было время, когда я действительно ничего не должен?</label>${ynOpt('freeTime')}
    <label class="f">Получилось почувствовать облегчение без алкоголя?</label>${ynOpt('relief')}
    <label class="f">Что было сильнее?</label><div class="opts o1"><button class="opt ${F.stronger === 'craving' ? 'on' : ''}" onclick="F.stronger='craving';refreshSheet()">тяга к опьянению</button><button class="opt ${F.stronger === 'duties' ? 'on' : ''}" onclick="F.stronger='duties';refreshSheet()">не мог отключиться от обязанностей</button></div>
    <div class="tip">Хмурый трезвый вечер — не доказательство, что без пива хуже. Это данные. Если подавленность держится — обсуди с врачом.</div>`;
  }
  return `<h2>${CP[k]}</h2><div class="sub">${fmtT(F.ts)}</div>${moodRow()}${body}<label class="f">Заметка</label><textarea oninput="F.note=this.value">${esc(F.note)}</textarea>${recBlock()}
    <div class="btns"><button class="pri" onclick="saveCheck()">Сохранить</button></div>`;
}
window.tg2 = i => { const r = D.ritual[i]; const a = F.ritualDone; const j = a.indexOf(r); j < 0 ? a.push(r) : a.splice(j, 1); refreshSheet(); };
window.quickTried = (offerId, v, el) => { D.feedback.push(TV.stamp({ offer_id: offerId, tried: v, result: null, craving_after: null, drank_tonight: null, cans: null, note: null, asked_at: Date.now(), answered_at: Date.now(), source: el ? 'morning' : 'line' }));
  ev('feedback', 'offer', offerId, { tried: v }); save(); if (el) el.parentNode.innerHTML = '<span class="sub" style="color:var(--ok)">✓ записано</span>'; else { renderTop(true); renderLine(); } };
window.saveCheck = () => {
  if (rec) stopRec(); D.entries.push(F); if (F.kind === 'night') onNightCheck(F); save();
  const k = F.kind, thought = F.thought; closeSheet(); toast('Записано');
  if (UI.tab === 'now' && $('top')) { renderTop(); renderLine(); }
  if ((k === 'afternoon' && thought) || k === 'morning') { D.now.mode = 'plan'; save(); UI.deckKey = null; setTimeout(() => { renderNow(true); scrollToNow(); }, 300); }
};
function onNightCheck(e) {
  if (e.drank == null) return;
  D.responses.filter(r => r.action === 'accepted' && dayKey(r.created_at) === today()).forEach(r => {
    let f = fbFor(r.offer_id);
    if (!f) { f = TV.stamp({ offer_id: r.offer_id, tried: null, result: null, craving_after: null, note: null, asked_at: Date.now(), answered_at: null, source: 'night' }); D.feedback.push(f); }
    f.drank_tonight = e.drank ? 'yes' : 'no'; f.cans = e.drank ? e.cans : 0; TV.touch(f);
  });
  if (D.now.mode === 'plan') D.now.mode = 'now';
}

// ---------- голос ----------
let rec = null, recStart = 0, recTick = null;
function recBlock() { return `<label class="f">Голосом</label><div id="recb">${recInner()}</div>`; }
function recInner() {
  return `${(F.audio || []).map(a => `<div class="rec"><button class="tiny" onclick="playA('${a}')">▶ ${esc(a.slice(-10))}</button></div>`).join('')}
  ${rec ? `<div class="rec"><div class="dot"></div><span id="rt">0:00</span><button class="danger tiny" onclick="stopRec()">Стоп</button></div>` : `<button onclick="startRec()">${ICON.mic} Записать, что чувствую</button>`}`;
}
window.startRec = () => { if (!HAS) { alert('Запись работает в приложении'); return; }
  const r = Android.startRecording(F.id + '_' + (F.audio.length + 1));
  if (r === 'no_permission') { alert('Разреши доступ к микрофону и нажми ещё раз'); return; }
  if (r.startsWith('error')) { alert('Не удалось начать запись: ' + r); return; }
  rec = r; recStart = Date.now(); $('recb').innerHTML = recInner();
  recTick = setInterval(() => { const s = Math.round((Date.now() - recStart) / 1000); const el = $('rt'); if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500); };
function stopRec() { const n = HAS ? Android.stopRecording() : ''; clearInterval(recTick); if (n) { F.audio.push(n); F.audioSec = (F.audioSec || 0) + Math.round((Date.now() - recStart) / 1000); } rec = null; const b = $('recb'); if (b) b.innerHTML = recInner(); };
window.stopRec = stopRec;
window.playA = a => { HAS && Android.play(a); };
window.openVoice = () => { F = { id: uid(), ts: Date.now(), type: 'voice', mood: 5, note: '', audio: [] };
  openSheet(() => `<h2>Проговорить</h2><div class="sub">Без анкеты. Просто скажи, что сейчас происходит.</div>${moodRow()}${recBlock()}<label class="f">Заметка (по желанию)</label><textarea oninput="F.note=this.value">${esc(F.note)}</textarea>
    <div class="btns"><button class="pri" onclick="saveVoice()">Сохранить</button></div>`); };
window.saveVoice = () => { if (rec) stopRec(); D.entries.push(F); save(); closeSheet(); toast('Записано'); if ($('past')) renderLine(); };

// ---------- запись дневника ----------
function lbl(list, keys) { return (keys || []).map(k => (list.find(x => x[0] === k) || [, k])[1]).join(', '); }
function checkinSummary(e) { const p = [];
  if (e.kind === 'night' && e.drank != null) p.push(e.drank ? 'пил, банок: ' + e.cans : 'не пил');
  if (e.kind === 'afternoon' && e.load != null) p.push('нагрузка ' + e.load);
  if (e.mood != null) p.push('настроение ' + e.mood);
  return p.join(' · '); }
function entryTitle(e) { return e.type === 'craving' ? 'Тяга ' + e.intensity + '/10' : e.type === 'voice' ? 'Голосовая заметка' : CP[e.kind]; }
function entrySummary(e) { const p = [];
  if (e.type === 'craving') { if (e.wants.length) p.push('хочу: ' + lbl(WANTS, e.wants)); if (e.triggers.length) p.push('триггер: ' + lbl(TRIG, e.triggers)); if (e.outcome) p.push(e.outcome === 'passed' ? '→ отпустило' : '→ выпил'); }
  else if (e.type === 'checkin') p.push(checkinSummary(e)); else if (e.mood != null) p.push('настроение ' + e.mood);
  if (e.audio && e.audio.length) p.push('голос: ' + e.audio.length);
  return esc(p.filter(Boolean).join(' · ')); }
window.openEntry = id => { const e = D.entries.find(x => x.id === id); if (!e) return; F = e;
  openSheet(() => `<h2>${entryTitle(e)}</h2><div class="sub">${esc(fmtD(e.ts))}, ${fmtT(e.ts)}</div><div style="margin-top:10px">${entrySummary(e)}</div>
    ${e.note ? `<div class="tip" style="white-space:pre-wrap">${esc(e.note)}</div>` : ''}
    ${(e.audio || []).length ? `<div class="btns">${e.audio.map(a => `<button onclick="playA('${a}')">▶ запись</button>`).join('')}</div>` : ''}
    ${e.type === 'craving' && !e.outcome ? `<div class="btns"><button onclick="cravingOut('${e.id}','passed');closeSheet()">Отпустило</button><button onclick="cravingOut('${e.id}','drank');closeSheet()">Выпил</button></div>` : ''}
    <div class="btns"><button class="danger" onclick="delEntry('${e.id}')">Удалить запись</button></div>`); };
window.delEntry = id => { if (!confirm('Удалить запись?')) return; const e = D.entries.find(x => x.id === id); (e.audio || []).forEach(a => HAS && Android.deleteAudio(a)); D.entries = D.entries.filter(x => x.id !== id); save(); closeSheet(); render(); };

// ================= ДНЕВНИК =================
V.diary = () => {
  const days = new Set(D.entries.map(e => dayKey(e.ts))); D.feedback.forEach(f => f.answered_at && days.add(dayKey(f.answered_at))); D.places_log.forEach(p => days.add(dayKey(p.ts)));
  const list = [...days].sort().reverse().slice(0, 60);
  const open = UI.diaryOpen || list[0];
  return `<header class="page"><h1>Дневник</h1><div class="sub">Каждый день — своя линия и своё колесо.</div></header><div class="wrap">
    ${list.map(dk => { const [a, b] = TV.dayBounds(new Date(dk + 'T12:00:00').getTime()); const bal = TV.balance(PACK, D, a, b); const di = dayInfo()[dk] || {}; const got = SECT.filter(s => bal.fill[s] > 0).length;
      return `<div class="card" style="padding:4px 16px"><div class="dayrow" onclick="UI.diaryOpen='${open === dk ? '' : dk}';render()" style="border:0">${wheelSvg(bal.fill, { small: true })}
        <div><b>${esc(fmtDs(new Date(dk + 'T12:00:00').getTime()))}</b><div class="sub">${got} из 6 сторон · ходов: ${bal.moves.length}${di.cravings ? ' · тяга: ' + di.cravings : ''}</div></div>
        <div class="sub">${di.drank === false ? '<span style="color:var(--ok)">не пил</span>' : di.drank ? '<span style="color:var(--bad)">пил</span>' : ''}</div></div>
        ${open === dk ? `<div class="line rise" style="padding:0 0 10px">${lineItems(dk, false).map(i => liHtml(i)).join('') || '<div class="sub" style="margin-left:46px">пусто</div>'}</div>` : ''}</div>`; }).join('') || '<div class="card">Пока пусто. Всё, что происходит за день, появится здесь.</div>'}</div>`;
};

// ================= БАЛАНС =================
V.balance = () => {
  const now = Date.now(); const [, b] = TV.dayBounds(now); const wk = TV.balance(PACK, D, b - 7 * 86400000, b);
  const m = dayInfo(); const days = []; const d = new Date(); d.setDate(d.getDate() - 27);
  for (let i = 0; i < 28; i++) { const k = dayKey(d); const x = m[k]; days.push(`<div class="${x && x.drank === false ? 's' : x && x.drank ? 'd' : ''} ${x && x.cp.size ? 'c' : ''}">${d.getDate()}</div>`); d.setDate(d.getDate() + 1); }
  const stt = TV.scenarioStats(D); const helps = Object.entries(stt).filter(([id, x]) => x.better && PACK.byId[id]).sort((a, c) => c[1].better - a[1].better).slice(0, 5);
  const places = {}; wk.moves.forEach(x => x.place && (places[x.place] = (places[x.place] || 0) + 1));
  const cr = D.entries.filter(e => e.type === 'craving');
  const cnt = (f, list) => { const c = {}; cr.forEach(e => (e[f] || []).forEach(k => c[k] = (c[k] || 0) + 1)); return Object.entries(c).sort((a, c2) => c2[1] - a[1]).map(([k, v]) => `<div style="margin:8px 0">${lbl(list, [k])} — ${v}<div class="bar"><div style="width:${100 * v / cr.length}%"></div></div></div>`).join('') || '<div class="sub">нет данных</div>'; };
  const hours = {}; cr.forEach(e => { const h = new Date(e.ts).getHours(); hours[h] = (hours[h] || 0) + 1; });
  const reasons = {}; D.responses.filter(r => r.decline_reason).forEach(r => reasons[r.decline_reason] = (reasons[r.decline_reason] || 0) + 1);
  const weak = SECT.filter(s => wk.done[s] < 2).map(s => LBL.sectors[s]);
  return `<header class="page"><h1>Баланс</h1><div class="sub">Неделя целиком: какие стороны получали своё, а какие нет.</div></header><div class="wrap">
  <div class="card" style="display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:center"><div class="wheel">${wheelSvg(Object.fromEntries(SECT.map(s => [s, Math.min(1, wk.done[s] / 7)])), { from: true })}</div>
    <div>${SECT.map(s => `<div style="display:flex;justify-content:space-between;font-size:14px;height:22px"><span style="color:${SC(s)}">${LBL.sectors[s]}</span><b>${wk.done[s]}</b></div>`).join('')}</div></div>
  ${weak.length ? `<div class="tip">За неделю меньше всего: ${esc(weak.join(', '))}. Приложение будет чаще предлагать эти стороны.</div>` : ''}
  <div class="card"><h2>Вечера</h2><div class="days">${days.join('')}</div><div class="sub" style="margin-top:8px">Зелёный — не пил, красный — пил, рамка — были отметки</div></div>
  <div class="card"><div class="stat3"><div><b>${D.offers.length}</b><span>предложено</span></div><div><b>${D.feedback.filter(f => f.tried === 'yes' || f.tried === 'partly').length}</b><span>ходов сделано</span></div><div><b>${D.feedback.filter(f => f.result === 'better').length}</b><span>стало лучше</span></div></div></div>
  <div class="card"><h2>После чего лучше</h2>${helps.map(([id, x]) => `<div class="rowline"><span>${esc(PACK.byId[id].title)}</span><b>${x.better}</b></div>`).join('') || '<div class="sub">пока нет данных</div>'}</div>
  <div class="card"><h2>Где ты делаешь ходы</h2>${Object.entries(places).sort((a, c) => c[1] - a[1]).map(([p, v]) => `<div style="margin:8px 0">${LBL.places[p]} — ${v}<div class="bar"><div style="width:${100 * v / wk.moves.length}%"></div></div></div>`).join('') || '<div class="sub">нет данных за неделю</div>'}</div>
  <div class="card"><div class="stat3"><div><b>${cr.length}</b><span>эпизодов тяги</span></div><div><b>${cr.filter(e => e.outcome === 'passed').length}</b><span>отпустило</span></div><div><b>${cr.filter(e => e.outcome === 'drank').length}</b><span>выпил</span></div></div></div>
  <div class="card"><h2>Чего я хотел</h2>${cnt('wants', WANTS)}</div>
  <div class="card"><h2>Триггеры</h2>${cnt('triggers', TRIG)}</div>
  <div class="card"><h2>Время тяги</h2>${Object.keys(hours).sort((a, c) => a - c).map(h => `${h}:00 — ${hours[h]}`).join('<br>') || '<div class="sub">нет данных</div>'}</div>
  <div class="card"><h2>Почему отказывался</h2>${Object.entries(reasons).map(([k, v]) => `<div class="rowline"><span>${esc(LBL.decline_reasons[k] || k)}</span><b>${v}</b></div>`).join('') || '<div class="sub">нет данных</div>'}</div></div>`;
};
V.balance_after = () => animateWheel($('app'));

// ================= НАСТРОЙКИ =================
V.settings = () => `<header class="page"><h1>Настройки</h1></header><div class="wrap">
  <div class="card"><h2>Обо мне и ходы</h2><div class="btns" style="margin-top:0"><button onclick="go('profile')">Анкета</button><button onclick="go('library')">Все ходы</button></div>
    <div class="sub" style="margin-top:10px">Пакет: ${PACK.pack_id} ${PACK.version}, ходов: ${PACK.scenarios.length}</div></div>
  <div class="card"><h2>Выгрузка для анализа</h2><div class="sub">ZIP: journal.md, data.json, scenarios.json, audio/.</div>
    <div class="btns"><button class="pri" onclick="doExport()">Выгрузить</button><button onclick="HAS?Android.shareText(buildMd()):alert(buildMd())">Только текст</button></div></div>
  <div class="card"><h2>Напоминания</h2>${D.reminders.map((r, i) => `<div class="rowline r3"><span>${REM[r.k] || r.k}</span><input type="time" value="${r.t}" onchange="D.reminders[${i}].t=this.value;D.reminders[${i}].custom=true;saveRem()"><input type="checkbox" class="switch" ${r.on ? 'checked' : ''} onchange="D.reminders[${i}].on=this.checked;saveRem()"></div>`).join('')}</div>
  <div class="card"><h2>Предложения</h2><label class="f" style="margin-top:0">Не больше проактивных напоминаний в день</label>
    <div class="opts o3">${[1, 2, 3].map(n => `<button class="opt ${D.proactive.max_daily === n ? 'on' : ''}" onclick="D.proactive.max_daily=${n};saveProactive()">${n}</button>`).join('')}</div>
    <label class="f">Тихие часы</label><div class="opts"><input type="time" value="${D.proactive.quiet_from}" onchange="D.proactive.quiet_from=this.value;saveProactive()"><input type="time" value="${D.proactive.quiet_to}" onchange="D.proactive.quiet_to=this.value;saveProactive()"></div>
    <div class="rowline" style="margin-top:6px"><span>Спрашивать «как прошло?»</span><input type="checkbox" class="switch" ${D.proactive.followups ? 'checked' : ''} onchange="D.proactive.followups=this.checked;saveProactive()"></div></div>
  <div class="card"><h2>Мои причины</h2><div class="sub">Видны, когда тянет.</div>${D.reasons.map((r, i) => `<div class="rowline"><span>${esc(r)}</span><button class="tiny ghost" onclick="D.reasons.splice(${i},1);save();render()">Убрать</button></div>`).join('')}
    <div class="btns c2"><input type="text" id="nr" placeholder="например: вечера с детьми"><button onclick="if($('nr').value.trim()){D.reasons.push($('nr').value.trim());save();render()}">Добавить</button></div></div>
  <div class="card"><h2>Ритуал «снять плащ»</h2>${D.ritual.map((r, i) => `<div class="rowline"><span>${esc(r)}</span><button class="tiny ghost" onclick="D.ritual.splice(${i},1);save();render()">Убрать</button></div>`).join('')}
    <div class="btns c2"><input type="text" id="nri" placeholder="новый пункт"><button onclick="if($('nri').value.trim()){D.ritual.push($('nri').value.trim());save();render()}">Добавить</button></div></div>
  <div class="card"><h2>Удалить всё</h2><div class="sub">Сотрёт дневник, голос, анкету и историю ходов на этом телефоне.</div><div class="btns"><button class="danger" onclick="wipeAll()">Удалить всю историю</button></div></div>
  <div class="warn">При дрожи, потливости, тошноте, сильном сердцебиении после сокращения алкоголя — к врачу. При судорогах, галлюцинациях, спутанности — 112.<div class="btns"><button class="danger" onclick="HAS&&Android.call('112')">Позвонить 112</button></div></div>
  <div class="sub" style="margin:16px 4px 24px">Все данные хранятся только на телефоне. Приложение — поддержка в изменении привычки, не лечение. 18+.</div></div>`;
window.saveRem = () => { save(); HAS && Android.setReminders(JSON.stringify(D.reminders)); };
window.saveProactive = () => { ev('proactive_updated', 'store', D.install_id, D.proactive); save(); syncProactive(); render(); };
window.wipeAll = () => {
  if (!confirm('Удалить всю историю? Это нельзя отменить.') || !confirm('Точно удалить?')) return;
  D.prompts.filter(p => p.status === 'scheduled').forEach(p => HAS && Android.cancelOnce && Android.cancelOnce(p.id));
  if (HAS && Android.wipe) Android.wipe(); else localStorage.removeItem('d');
  const rem = D.reminders; D = TV.migrate({ reminders: rem, reasons: [], ritual: D.ritual }); D.onboarded_at = Date.now(); save(); syncProactive(); UI.deckKey = null; tab('now');
};

// ---------- все ходы ----------
V.library = () => {
  const f = UI.libF || (UI.libF = { place: null, sector: null });
  const stt = TV.scenarioStats(D);
  const list = PACK.scenarios.filter(s => (!f.place || s.places.includes(f.place)) && (!f.sector || s.sector === f.sector));
  return `<header class="page"><h1>Все ходы</h1><div class="sub">${PACK.scenarios.length} ходов по местам и сторонам. Звёздочка — чаще предлагать.</div></header><div class="wrap">
    <div class="scroller" style="margin-top:6px"><button class="chip ${!f.place ? 'on' : ''}" onclick="UI.libF.place=null;render()">Все места</button>${PACK.taxonomy.places.map(p => `<button class="chip ${f.place === p.key ? 'on' : ''}" onclick="UI.libF.place='${p.key}';render()">${esc(p.label)}</button>`).join('')}</div>
    <div class="scroller"><button class="chip ${!f.sector ? 'on' : ''}" onclick="UI.libF.sector=null;render()">Все стороны</button>${SECT.concat(['shift']).map(s => `<button class="chip ${f.sector === s ? 'on' : ''}" style="${f.sector === s ? `background:${SC(s)}` : ''}" onclick="UI.libF.sector='${s}';render()">${esc(LBL.categories[s])}</button>`).join('')}</div>
    <div class="card" style="padding:4px 16px">${list.map(s => { const p = D.prefs[s.id] || {}; const x = stt[s.id] || {};
      return `<div class="lib"><div><div class="t" style="${p.blocked ? 'opacity:.45;text-decoration:line-through' : ''}"><span style="color:${SC(s.sector)}">●</span> ${esc(s.title)}</div><div class="m">${placesLbl(s.places)} · ${s.duration_min}–${s.duration_max} мин${x.tried ? ' · сделано ' + x.tried : ''}</div></div>
      <div style="display:flex;gap:6px"><button class="tiny ${p.favorite ? 'pri' : ''}" onclick="togglePref('${s.id}','favorite')">${p.favorite ? '★' : '☆'}</button><button class="tiny ghost" onclick="togglePref('${s.id}','blocked')">${p.blocked ? 'Вернуть' : 'Скрыть'}</button></div></div>`; }).join('')}</div></div>`;
};

// ---------- анкета ----------
let PR = null;
const Q = [
  ['works_outside', 'Днём ты обычно…', [[true, 'На работе вне дома'], [false, 'Дома']]],
  ['can_leave_home_evening', 'Вечером обычно можешь выйти из дома?', [['yes', 'Да'], ['sometimes', 'Иногда'], ['no', 'Нет']]],
  ['care_duties', 'Вечером на тебе забота о ком-то?', [['none', 'Нет'], ['kids', 'Дети'], ['other', 'Другое']]],
  ['has_balcony', 'Есть балкон?', [[true, 'Да'], [false, 'Нет']]],
  ['budget', 'Тратить деньги на вечер?', [[0, 'Бесплатно'], [1, 'Немного'], [2, 'По ситуации']]],
  ['has_close_person', 'Есть кому написать без повода?', [[true, 'Да'], [false, 'Сейчас нет']]],
  ['novelty_readiness', 'Готов пробовать непривычное?', [[1, 'Лучше привычное'], [2, 'Иногда'], [3, 'Люблю странное']]]
];
const QM = [
  ['social_pref', 'С кем легче отдыхать?', [['solo', 'Одному'], ['with_close', 'С близким'], ['among_people', 'Среди людей']]],
  ['dislikes', 'Что точно не предлагать?', PACK.taxonomy.tags.map(t => [t.key, t.label])],
  ['constraints', 'Ограничения', PACK.taxonomy.constraints.map(t => [t.key, t.label])],
  ['liked_before', 'Что раньше нравилось, но давно не делал?', PACK.taxonomy.tags.map(t => [t.key, t.label])],
  ['curious_to_try', 'Что любопытно попробовать?', PACK.taxonomy.tags.map(t => [t.key, t.label])]
];
V.profile = () => {
  if (!PR) PR = Object.assign({ social_pref: [], dislikes: [], constraints: [], liked_before: [], curious_to_try: [], usual_drink_time: '19:00' }, JSON.parse(JSON.stringify(D.profile || {})));
  const cls = n => n === 3 ? 'o3' : n === 2 ? '' : '';
  const one = ([f, q, opts]) => `<label class="f">${q}</label><div class="opts ${cls(opts.length)}">${opts.map(([v, l]) => `<button class="opt ${PR[f] === v ? 'on' : ''}" onclick='PR["${f}"]=${JSON.stringify(v)};render()'>${l}</button>`).join('')}</div>`;
  const many = ([f, q, opts]) => `<label class="f">${q}</label><div class="opts ${opts.length === 3 ? 'o3' : ''}">${opts.map(([v, l]) => `<button class="opt ${PR[f].includes(v) ? 'on' : ''}" onclick='prTog("${f}",${JSON.stringify(v)})'>${l}</button>`).join('')}</div>`;
  return `<header class="page"><h1>Обо мне</h1><div class="sub">Минута — и подбор станет точнее. Любой вопрос можно пропустить.</div></header><div class="wrap"><div class="card">
    ${Q.map(one).join('')}${QM.map(many).join('')}
    <label class="f">Во сколько обычно хочется выпить?</label><input type="time" value="${PR.usual_drink_time}" onchange="PR.usual_drink_time=this.value"></div>
    <div class="btns" style="margin-bottom:20px"><button class="pri" onclick="saveProfile()">Сохранить</button></div></div>`;
};
window.prTog = (f, v) => { const a = PR[f]; const i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1); const y = window.scrollY; render(); window.scrollTo(0, y); };
window.saveProfile = () => {
  const first = !D.profile;
  D.profile = first ? TV.stamp(Object.assign({ questionnaire_version: 2, completed_at: Date.now() }, PR)) : TV.touch(Object.assign(D.profile, PR, { questionnaire_version: 2, completed_at: D.profile.completed_at || Date.now() }));
  const pre = D.reminders.find(r => r.k === 'pre');
  if (pre && !pre.custom && PR.usual_drink_time) { const t = (hm2min(PR.usual_drink_time) - 60 + 1440) % 1440; pre.t = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  ev(first ? 'profile_created' : 'profile_updated', 'profile', D.profile.id, {}); PR = null; save(); saveRem(); UI.deckKey = null; goBack();
};

// ---------- приветствие ----------
V.welcome = () => `<header class="page"><h1>Трезвый вечер</h1><div class="sub">Версия ${APP_VERSION} · Равновесие</div></header><div class="wrap">
  <div class="card rise"><div class="wheel" style="width:150px;margin:0 auto">${wheelSvg({ body: 1, hands: .6, mind: .8, people: .4, world: .7, quiet: .9 })}</div>
  <div style="margin-top:10px">У дня шесть сторон: тело, руки, голова, люди, мир, тишина. Когда какая-то пустует, вечером тянет заполнить пустоту банкой.</div>
  <div style="margin-top:8px">Приложение видит, где ты — на диване, на кухне, в дороге, на работе, — и предлагает один небольшой ход, который восполняет то, чего сегодня не хватило. Сделал — колесо заполняется.</div></div>
  <div class="warn rise" style="animation-delay:.1s">Это поддержка в изменении привычки, а не лечение. Для взрослых 18+. Не подходит для самостоятельной отмены алкоголя при длительном ежедневном употреблении: если при сокращении появляются дрожь, потливость, тревога, бессонница, галлюцинации — нужен врач-нарколог.</div>
  <div class="btns"><button onclick="welcomeDone(false)">Мне есть 18 — начать</button><button class="pri" onclick="welcomeDone(true)">18+ — анкета</button></div></div>`;
window.welcomeDone = p => { D.onboarded_at = Date.now(); ev('onboarded', 'store', D.install_id, { adult_confirmed: true }); save(); tab('now'); if (p) go('profile'); };

// ================= ВЫГРУЗКА =================
function buildMd() {
  const L = []; const s = streaks();
  L.push('# Дневник «Трезвый вечер»', '', `Выгружено: ${new Date().toLocaleString('ru-RU')}`, `Записей: ${D.entries.length}. Текущая серия без пива: ${s.sober} дн., лучшая: ${s.best} дн.`, '');
  if (D.reasons.length) L.push('Мои причины: ' + D.reasons.join('; '), '');
  L.push('Голосовые записи лежат в папке audio/, имена файлов указаны у записей.', '');
  const keys = new Set(D.entries.map(e => dayKey(e.ts))); D.feedback.forEach(f => f.answered_at && keys.add(dayKey(f.answered_at)));
  for (const dk of [...keys].sort()) {
    const ts = new Date(dk + 'T12:00:00').getTime(); const [a, b] = TV.dayBounds(ts); const bal = TV.balance(PACK, D, a, b);
    L.push('', `## ${dk} (${fmtDs(ts)})`, `Равновесие: ${SECT.filter(x => bal.fill[x] > 0).length}/6 — ${SECT.map(x => LBL.sectors[x] + ' ' + bal.done[x]).join(', ')}`);
    const rows = [];
    for (const e of D.entries.filter(e => dayKey(e.ts) === dk)) {
      const f = [];
      if (e.type === 'craving') { f.push(`интенсивность ${e.intensity}/10`); if (e.wants.length) f.push('хотел: ' + lbl(WANTS, e.wants)); if (e.triggers.length) f.push('триггеры: ' + lbl(TRIG, e.triggers)); f.push('исход: ' + (e.outcome === 'passed' ? 'отпустило' : e.outcome === 'drank' ? 'выпил' : 'не отмечен')); }
      if (e.mood != null) f.push(`настроение ${e.mood}/10`);
      if (e.kind === 'morning' && e.plan) f.push('нагрузка дня: ' + e.plan);
      if (e.kind === 'afternoon') { f.push('мысль о пиве: ' + (e.thought == null ? '—' : e.thought ? 'да' : 'нет')); f.push(`нагруженность ${e.load}/10`); }
      if (e.kind === 'evening') { f.push('перерыв согласован: ' + (e.agreed == null ? '—' : e.agreed ? 'да' : 'нет')); if (e.ritualDone.length) f.push('ритуал: ' + e.ritualDone.join(', ')); }
      if (e.kind === 'night') { f.push('пил: ' + (e.drank == null ? '—' : e.drank ? `да, банок ${e.cans}` : 'нет')); f.push('свободное время: ' + (e.freeTime == null ? '—' : e.freeTime ? 'да' : 'нет')); f.push('облегчение без алкоголя: ' + (e.relief == null ? '—' : e.relief ? 'да' : 'нет')); if (e.stronger) f.push('сильнее было: ' + (e.stronger === 'craving' ? 'тяга к опьянению' : 'обязанности')); }
      let r = `- **${fmtT(e.ts)} — ${entryTitle(e)}**: ${f.join('; ')}`;
      if (e.note) r += `\n  - заметка: ${e.note.replace(/\n/g, ' ')}`;
      if (e.audio && e.audio.length) r += `\n  - аудио: ${e.audio.map(x => 'audio/' + x).join(', ')}`;
      rows.push([e.ts, r]);
    }
    for (const m of bal.moves) { const sc = PACK.byId[m.scenario_id]; const fb = fbFor(m.offer_id);
      rows.push([m.ts, `- **${fmtT(m.ts)} — ход «${sc.title}»** (${LBL.sectors[m.sector]}${m.place ? ', ' + LBL.places[m.place] : ''}): ${m.w < 1 ? 'частично' : 'сделал'}${m.result ? ', ' + { better: 'стало лучше', same: 'так же', worse: 'хуже' }[m.result] : ''}${fb && fb.note ? ` — «${fb.note.replace(/\n/g, ' ')}»` : ''}`]); }
    rows.sort((x, y) => x[0] - y[0]).forEach(r => L.push(r[1]));
  }
  return L.join('\n');
}
window.buildMd = buildMd;
window.exportScenariosJson = () => JSON.stringify({ schema_version: D.schema_version, install_id: D.install_id, pack: { id: PACK.pack_id, version: PACK.version },
  profile: D.profile, proactive: D.proactive, now: D.now, places_log: D.places_log, sessions: D.sessions, offers: D.offers, responses: D.responses, feedback: D.feedback, prompts: D.prompts, prefs: D.prefs, events: D.events }, null, 1);
window.doExport = () => { if (!HAS) { alert(buildMd()); return; } const r = Android.export2(buildMd(), exportScenariosJson(), 'trezvo_' + today() + '.zip'); if (r !== 'ok') alert(r); };

// ================= УВЕДОМЛЕНИЯ =================
window.openFromNotification = k => {
  if (!D.onboarded_at) return;
  if (k.startsWith('tab:')) { tab(k.slice(4)); return; }
  if (UI.tab !== 'now' || UI.stack.length) tab('now');
  if (CP[k]) { openCheckin(k); return; }
  if (k === 'craving') { scrollToNow(); const r = document.querySelector('.pull input'); r && r.focus(); return; }
  if (k === 'plan') { UI.trigger = 'day_plan'; D.now.mode = 'plan'; save(); UI.deckKey = null; renderNow(true); scrollToNow(); return; }
  if (k === 'pre') { UI.trigger = 'pre_evening'; D.now.mode = 'now'; if (!D.now.place || Date.now() - D.now.place_ts > 2 * 3600000) setPlace(TV.guessPlace(Date.now(), D.profile) === 'work' ? 'road' : TV.guessPlace(Date.now(), D.profile), 'notification'); save(); UI.deckKey = null; renderNow(true); renderLine(); scrollToNow(); return; }
  if (k.startsWith('do:')) { const id = k.slice(3); D.prompts.filter(p => p.offer_id === id && p.kind === 'plan_reminder').forEach(p => { p.status = 'opened'; TV.touch(p); });
    if (byId(D.offers, id) && !fbFor(id)) { UI.trigger = 'plan_reminder'; mvDo(id); renderLine(); scrollToNow(); } return; }
  if (k.startsWith('fb:')) { const id = k.slice(3); D.prompts.filter(p => p.offer_id === id && p.kind === 'followup').forEach(p => { p.status = 'opened'; TV.touch(p); });
    if (D.now.active && D.now.active.offer_id === id) { UI.cardState = 'result'; renderNow(false, true); scrollToNow(); } return; }
};

// ================= САМОТЕСТ =================
window.onerror = (m, src, l) => { console.error('JSERROR ' + m + ' @' + l); };
async function selfTest() {
  const errs = [], log = m => console.log('SELFTEST ' + m), ok = (c, m) => { if (!c) { errs.push(m); console.error('SELFTEST FAIL ' + m); } else log('pass ' + m); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const backup = JSON.stringify(D); const testAudio = []; const html = () => document.body.innerHTML;
  try {
    D.onboarded_at = D.onboarded_at || Date.now(); D.profile = null; D.now = { place: null, place_ts: 0, mode: 'now' };
    ok(PACK.scenarios.length >= 120, 'pack loaded ' + PACK.scenarios.length); ok(TV.validatePack(PACK).length === 0, 'pack valid');
    for (const t of ['now', 'diary', 'balance', 'settings']) { tab(t); await sleep(50); ok($('app').innerHTML.length > 200, 'render ' + t); }
    tab('now'); await sleep(50);
    ok(!!document.querySelector('.wheel .petal'), 'wheel rendered'); ok(!!document.querySelector('.mv h2'), 'card rendered');
    // место → карточка подходит месту
    pickPlace('kitchen'); await sleep(300);
    let c = currentCard(); ok(PACK.byId[c.offer.scenario_id].places.includes('kitchen'), 'card fits kitchen ' + c.offer.scenario_id);
    // «Другое» меняет карточку
    const first = c.offer.scenario_id; mvNext(); await sleep(300); c = currentCard(); ok(c.offer.scenario_id !== first, 'next card differs');
    ok(respFor(D.offers.find(o => o.scenario_id === first && o.session_id === UI.session.id).id).some(r => r.action === 'skipped'), 'skip logged');
    // сделать ход → колесо
    const before = TV.todayBalance(PACK, D).total; const s0 = PACK.byId[c.offer.scenario_id];
    mvDo(c.offer.id); await sleep(50); ok(html().includes('Сделал') && D.now.active, 'active card');
    ok(D.prompts.some(p => p.kind === 'followup' && p.offer_id === c.offer.id), 'followup scheduled');
    mvFinish(); await sleep(50); ok(html().includes('Лучше'), 'result row');
    mvResult(c.offer.id, 'better'); await sleep(900);
    const after = TV.todayBalance(PACK, D); ok(after.total === before + 1 && after.done[s0.sector] >= 1, 'wheel filled ' + s0.sector);
    ok(!D.prompts.some(p => p.kind === 'followup' && p.offer_id === c.offer.id && p.status === 'scheduled'), 'followup cancelled');
    ok($('past').innerHTML.includes(esc(s0.title)), 'move on day line');
    if (s0.to) ok(currentPlace() === s0.to, 'place moved to ' + s0.to);
    // дефицит: следующая карточка — не та же сторона, если есть выбор
    c = currentCard(); ok(c && c.offer.features.deficit !== undefined, 'features logged');
    // тяга на линии
    pickPlace('sofa'); await sleep(300);
    pullSet(8); await sleep(300); const ce = lastCraving(); ok(ce && ce.intensity === 8, 'craving logged inline');
    ok(html().includes('Сильная тяга'), 'high craving warning'); ok($('wants').classList.contains('open'), 'wants open');
    const wb = [...document.querySelectorAll('#wants .chip')].find(b => b.textContent === 'тишины'); wb.click(); ok(ce.wants.includes('silence'), 'want toggled');
    UI.deckKey = null; c = currentCard(); const sc = PACK.byId[c.offer.scenario_id]; ok(sc.duration_min <= 20 && sc.effort <= 2, 'craving → short move ' + sc.id);
    ok(D.sessions.some(x => x.trigger === 'craving' && x.craving_entry_id === ce.id), 'session trigger craving');
    // уже выпил → безопасные ходы
    toggleIntox(true); await sleep(300); UI.deckKey = null; buildDeck(true);
    ok(UI.deck.every(i => PACK.byId[i.pick.scenario_id].intoxicated_ok), 'intoxicated safe deck');
    // всё равно выпью
    stillDrink(); await sleep(300); c = currentCard(); ok(PACK.byId[c.offer.scenario_id].sector === 'shift', 'shift mode card');
    ok(UI.deck.every(i => PACK.byId[i.pick.scenario_id].sector === 'shift'), 'only shift cards');
    leaveShift(); toggleIntox(false); cravingOut(ce.id, 'passed'); D.now.intox_date = null; await sleep(300);
    // план на вечер
    setMode('plan'); await sleep(300); c = currentCard(); ok(mode() === 'plan' && !!$('pltc'), 'plan mode');
    ok(PACK.byId[c.offer.scenario_id].kind !== 'transition', 'plan: no transitions');
    $('pltc').value = '23:58'; planHere(c.offer.id); await sleep(400);
    ok(D.prompts.some(p => p.kind === 'plan_reminder' && p.offer_id === c.offer.id), 'plan reminder scheduled');
    ok($('future').innerHTML.includes('В плане') || $('past').innerHTML.includes('В плане'), 'plan on line');
    const planned = c.offer.id;
    openFromNotification('do:' + planned); await sleep(100); ok(D.now.active && D.now.active.offer_id === planned, 'planned → active');
    mvFinish(); mvResult(planned, 'same'); await sleep(900); setMode('now');
    // отказ «не могу сейчас» подставляет fallback
    pickPlace('stairs'); await sleep(300); UI.deckKey = null; buildDeck(true);
    const withFb = UI.deck.findIndex(i => PACK.byId[i.pick.scenario_id].fallback_id);
    if (withFb >= 0) { UI.idx = withFb; c = currentCard(); const fbid = PACK.byId[c.offer.scenario_id].fallback_id; mvDecline(c.offer.id, 'cant_now'); await sleep(300);
      const nx = currentCard(); ok(nx.offer.scenario_id === fbid || !TV.rank(PACK, D, UI.ctx).items.some(i => i.scenario_id === fbid), 'fallback offered ' + fbid); }
    // чекпоинты через нижнюю панель
    for (const k of ['morning', 'afternoon', 'evening', 'night']) {
      openCheckin(k); await sleep(50); ok(SHEET.open && $('sheetbody').innerHTML.includes(CP[k]), 'checkin sheet ' + k);
      if (k === 'night') { F.drank = false; F.freeTime = true; F.relief = true; F.stronger = 'duties'; }
      if (k === 'afternoon') { F.thought = false; F.load = 6; }
      if (k === 'evening') { F.agreed = true; F.ritualDone = [D.ritual[0]]; }
      F.mood = 6;
      if (k === 'morning' && HAS) { const r = Android.startRecording(F.id + '_1'); ok(!r.startsWith('error') && r !== 'no_permission', 'start recording: ' + r); rec = r; recStart = Date.now(); await sleep(2500); stopRec();
        ok(F.audio.length === 1, 'audio attached'); testAudio.push(...F.audio); ok(Android.audioSize(F.audio[0]) > 500, 'audio file size'); }
      saveCheck(); await sleep(400);
    }
    ok(!SHEET.open, 'sheet closed'); setMode('now');
    const st = streaks(); ok(st.sober >= 1, 'sober streak ' + st.sober); ok(st.check >= 1, 'checkin streak');
    ok(TV.dayLoad(D) != null, 'day load');
    tab('diary'); await sleep(50); ok(html().includes('из 6 сторон'), 'diary days');
    tab('balance'); await sleep(50); ok(html().includes('После чего лучше'), 'balance tab');
    go('library'); await sleep(50); ok(document.querySelectorAll('.lib').length >= 120, 'library list'); goBack();
    go('profile'); PR.can_leave_home_evening = 'no'; PR.budget = 0; PR.dislikes = ['photo']; saveProfile(); ok(D.profile && D.profile.can_leave_home_evening === 'no', 'profile saved');
    tab('now'); pickPlace('room'); await sleep(300); const h = new Date().getHours();
    UI.deckKey = null; buildDeck(true); ok(UI.deck.every(i => { const s = PACK.byId[i.pick.scenario_id]; return s.cost === 0 && !s.tags.includes('photo') && (h < 18 || !(s.to && TV.isOut(s.to))); }), 'deck respects profile');
    ok(D.offers.every(o => o.ranker_id && o.scenario_revision && o.features), 'offers have ranker & features');
    openVoice(); await sleep(50); ok(SHEET.open && html().includes('Проговорить'), 'voice sheet'); closeSheet(); await sleep(350);
    ok(goBack() === 'exit', 'back on root = exit');
    const md = buildMd(); ok(md.includes('Тяга 8/10') && md.includes('пил: нет') && md.includes('ход «'), 'markdown export content');
    ok(JSON.parse(exportScenariosJson()).offers.length === D.offers.length, 'scenarios json');
    if (HAS) { const raw = Android.load(); ok(JSON.parse(raw).entries.length === D.entries.length, 'persisted to file');
      const fn = 'selftest.zip'; ok(Android.export2(md, exportScenariosJson(), fn) === 'ok', 'export zip'); ok(+Android.exportPath(fn) > 100, 'zip size');
      Android.testNotify('evening'); log('notification sent'); }
    D.prompts.filter(p => p.status === 'scheduled').forEach(p => HAS && Android.cancelOnce && Android.cancelOnce(p.id));
  } catch (e) { errs.push('exception ' + e.message + ' ' + e.stack); console.error('SELFTEST EXC ' + e.message + ' ' + e.stack); }
  D = JSON.parse(backup); save(); testAudio.forEach(a => HAS && Android.deleteAudio(a)); UI.deckKey = null; UI.session = null; closeSheet(); tab('now');
  console.log('SELFTEST_RESULT ' + (errs.length ? 'FAIL ' + errs.join(' | ') : 'OK'));
  document.title = 'SELFTEST_RESULT ' + (errs.length ? 'FAIL' : 'OK');
  return errs;
}
window.selfTest = selfTest;

// ================= СТАРТ =================
refreshPrompts(); syncProactive(); if (HAS) Android.setReminders(JSON.stringify(D.reminders)); save();
render();
setInterval(() => { if (UI.tab === 'now' && !UI.stack.length && !SHEET.open && $('past')) renderLine(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && UI.tab === 'now' && !UI.stack.length && $('top')) { UI.deckKey = UI.deckKey && deckKey(ctxNow()) === UI.deckKey ? UI.deckKey : null; renderTop(); renderLine(); if (!D.now.active) renderNow(true); } });
if (location.search.includes('selftest')) setTimeout(selfTest, 100);
