// Трезвый вечер — экраны проактивных сценариев. Использует глобальные D, V, go, tab, st, stack, save, esc, fmtT, HAS из index.html
'use strict';
const APP_VERSION = '1.1.0';
const PACK = (function loadPack() {
  let txt = null;
  try { if (HAS && Android.asset) txt = Android.asset('content/core-ru.json'); } catch (e) {}
  if (!txt) { const x = new XMLHttpRequest(); x.open('GET', 'content/core-ru.json', false); x.send(); txt = x.responseText; }
  const p = JSON.parse(txt); const errs = TV.validatePack(p);
  if (errs.length) console.error('JSERROR content pack invalid: ' + errs.slice(0, 3).join('; '));
  return TV.indexPack(p);
})();
const TX = {}; for (const k of Object.keys(PACK.taxonomy)) if (Array.isArray(PACK.taxonomy[k]) && PACK.taxonomy[k][0] && PACK.taxonomy[k][0].key) { TX[k] = {}; PACK.taxonomy[k].forEach(x => TX[k][x.key] = x.label); }
const REM = window.REM = { morning: 'Утро', plan: 'План вечера', afternoon: 'День', pre: 'Перед вечером', evening: 'Вечерний перерыв', night: 'Итог дня' };
const WANT2NEED = { silence: 'leave_me_alone', alone: 'leave_me_alone', stopthink: 'switch_off', pleasure: 'comfort', reward: 'comfort', tired: 'rest', drunk: 'switch_off' };
const ev = (type, entity, id, payload) => TV.logEvent(D, type, entity, id, payload, Date.now(), APP_VERSION);
const byId = (arr, id) => arr.find(x => x.id === id);
const respFor = offerId => D.responses.filter(r => r.offer_id === offerId && !r.deleted_at);
const fbFor = offerId => D.feedback.find(f => f.offer_id === offerId && !f.deleted_at);
const scen = offerId => { const o = byId(D.offers, offerId); return o && PACK.byId[o.scenario_id]; };
const hhmm = ts => fmtT(ts);
function syncProactive() {
  if (!HAS || !Android.setProactive) return;
  const p = plannedToday();
  Android.setProactive(JSON.stringify({ max: D.proactive.max_daily, quiet_from: D.proactive.quiet_from, quiet_to: D.proactive.quiet_to, planned_date: p ? TV.localDate(p.resp.planned_for) : '' }));
}

// ---------- запланированное ----------
function plannedToday() {
  const t = today();
  const list = D.responses.filter(r => r.action === 'planned' && !r.deleted_at && !r.cancelled && r.planned_for && TV.localDate(r.planned_for) === t)
    .filter(r => !respFor(r.offer_id).some(x => x.action === 'accepted' && x.created_at > r.created_at));
  const r = list.sort((a, b) => b.created_at - a.created_at)[0];
  return r ? { resp: r, offer: byId(D.offers, r.offer_id), s: scen(r.offer_id) } : null;
}
function pendingFeedback() {
  const since = Date.now() - 2 * 86400000;
  return D.responses.filter(r => r.action === 'accepted' && r.created_at > since && !r.deleted_at && !fbFor(r.offer_id))
    .map(r => ({ resp: r, offer: byId(D.offers, r.offer_id), s: scen(r.offer_id) })).filter(x => x.s && x.s.category !== 'alcohol_shift' || x.s);
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

// ---------- движок разговора ----------
let RUN = null;
function startFlow(flowId, init) {
  init = init || {};
  if (RUN && RUN.session && !RUN.session.ended_at) endSession('abandoned');
  const f = PACK.flowsById[flowId];
  const s = TV.stamp({ trigger: init.trigger || f.trigger, flow_id: f.id, flow_revision: f.revision, pack_id: PACK.pack_id, pack_version: PACK.version,
    started_at: Date.now(), ended_at: null, context: Object.assign({}, init.context || {}), craving_entry_id: init.craving_entry_id || null,
    checkpoint_id: init.checkpoint_id || null, parent_session_id: init.parent_session_id || null, outcome: null });
  D.sessions.push(s); ev('session_started', 'session', s.id, { flow: f.id, trigger: s.trigger });
  RUN = { session: s, flow: f, node: null, visible: [], declines: 0, selected: init.selected || null, vars: {}, ui: {} };
  const pl = plannedToday(); RUN.session.context.has_plan = !!pl; if (pl) RUN.vars.plan_title = pl.s.title;
  save();
  if (stack[stack.length - 1] !== 'flow') go('flow'); 
  enterNode(init.node || f.entry_node);
}
function endSession(outcome) {
  if (!RUN || RUN.session.ended_at) return;
  RUN.visible.filter(id => !respFor(id).length).forEach(id => respond(id, 'ignored'));
  RUN.session.ended_at = Date.now(); RUN.session.outcome = outcome; TV.touch(RUN.session);
  ev('session_ended', 'session', RUN.session.id, { outcome, node: RUN.node && RUN.node.id }); save();
}
function enterNode(id) {
  if (id.startsWith('flow:')) {
    const parent = RUN.session; endSession('redirected');
    startFlow(id.slice(5), { context: Object.assign({}, parent.context), craving_entry_id: parent.craving_entry_id, checkpoint_id: parent.checkpoint_id, parent_session_id: parent.id });
    return;
  }
  const n = RUN.flow.byNode[id]; RUN.node = n; RUN.ui = {};
  const ctx = RUN.session.context;
  if (n.type === 'question' && n.skip_if && TV.condTrue(n.skip_if, ctx, D.profile)) {
    Object.assign(ctx, n.skip_sets || {}); return enterNode(n.skip_next);
  }
  if (n.type === 'offer') { RUN.visible = []; RUN.declines = 0; fillOffers(n.offer.count || 2); if (!RUN.visible.length) return enterNode(n.on.none_fit); }
  if (n.type === 'instruction' && ctx.use_planned && !RUN.selected) { const pl = plannedToday(); if (pl) { RUN.selected = pl.offer.id; respond(pl.offer.id, 'accepted'); } }
  if (n.type === 'end') endSession('completed');
  save(); render(); window.scrollTo(0, 0);
}
function sessionShownIds() { return D.offers.filter(o => o.session_id === RUN.session.id).map(o => o.scenario_id); }
function fillOffers(count, preferId) {
  const n = RUN.node; const ctx = RUN.session.context;
  const opts = { category: n.offer.category, max_effort: n.offer.max_effort, exclude_ids: sessionShownIds() };
  const ranked = TV.rank(PACK, D, ctx, opts);
  const avoid = RUN.visible.map(id => byId(D.offers, id).scenario_id).map(sid => PACK.byId[sid].category);
  let picks;
  const pref = preferId && ranked.items.find(i => i.scenario_id === preferId);
  if (pref) picks = [Object.assign({}, pref, { features: Object.assign({}, pref.features, { explore: 0, fallback: 1 }) })];
  else picks = TV.pick(ranked, count, { avoid_categories: avoid });
  for (const p of picks) {
    const o = TV.stamp({ session_id: RUN.session.id, node_id: n.id, scenario_id: p.scenario_id, scenario_revision: p.scenario_revision, variant_key: p.variant_key,
      position: RUN.visible.length, ranker_id: ranked.ranker_id, score: p.score, features: p.features, context: Object.assign({}, ctx), shown_at: Date.now() });
    D.offers.push(o); RUN.visible.push(o.id); ev('offer_shown', 'offer', o.id, { scenario: p.scenario_id, score: p.score });
  }
}
function respond(offerId, action, extra) {
  const r = TV.stamp(Object.assign({ offer_id: offerId, action, decline_reason: null, planned_for: null, responded_at: Date.now() }, extra || {}));
  D.responses.push(r); ev('offer_' + action, 'offer', offerId, extra || {}); return r;
}
window.qAnswer = function (key) {
  const n = RUN.node; const o = n.options.find(x => x.key === key); Object.assign(RUN.session.context, o.sets || {}); TV.touch(RUN.session);
  ev('answer', 'session', RUN.session.id, { node: n.id, key }); enterNode(o.next);
};
window.offerNow = function (offerId) { respond(offerId, 'accepted'); RUN.selected = offerId; enterNode(RUN.node.on.accepted); };
window.offerPlanUI = function (offerId) { RUN.ui = { planFor: offerId }; render(); };
window.offerPlan = function (offerId) {
  const val = document.getElementById('plt').value || '19:00'; const [h, m] = val.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  const r = respond(offerId, 'planned', { planned_for: d.getTime() }); const s = scen(offerId);
  schedulePrompt('plan_reminder', d.getTime(), 'Твой план на вечер', s.title + ': ' + TV.variantFor(s, RUN.session.context).text, 'do:' + offerId, false, { offer_id: offerId, response_id: r.id });
  RUN.vars.title = s.title; RUN.vars.time = val; syncProactive(); enterNode(RUN.node.on.planned);
};
window.offerDeclineUI = function (offerId) { RUN.ui = { declineFor: offerId }; render(); };
window.offerDecline = function (offerId, reason) {
  respond(offerId, 'declined', { decline_reason: reason }); RUN.declines++;
  const n = RUN.node; const s = scen(offerId);
  RUN.visible = RUN.visible.filter(id => id !== offerId);
  if (reason === 'too_hard') RUN.session.context.energy = 1;
  if (RUN.declines >= (n.offer.max_declines || 4)) return enterNode(n.on.none_fit);
  let pref = null;
  if (reason === 'cant_now' && s.fallback_id) pref = s.fallback_id;
  fillOffers(1, pref);
  if (!RUN.visible.length) return enterNode(n.on.none_fit);
  RUN.ui = {}; save(); render();
};
window.offerNone = function () { RUN.visible.filter(id => !respFor(id).length).forEach(id => respond(id, 'ignored')); ev('none_fit', 'session', RUN.session.id, { node: RUN.node.id }); enterNode(RUN.node.on.none_fit); };
function scheduleFollowup(offerId) {
  const s = scen(offerId); if (!D.proactive.followups || !s || !s.followup) return;
  cancelPrompts(p => p.kind === 'followup' && p.offer_id === offerId);
  schedulePrompt('followup', Date.now() + s.followup.delay_min * 60000, 'Как прошло?', s.followup.question, 'fb:' + offerId, true, { offer_id: offerId });
}
window.instrDone = function () { const n = RUN.node; if (n.schedule_followup) scheduleFollowup(RUN.selected); enterNode(n.on.done); };
window.instrLater = function () { scheduleFollowup(RUN.selected); enterNode(RUN.node.on.later || RUN.node.on.done); };
window.togglePref = function (sid, field) { const p = D.prefs[sid] = D.prefs[sid] || {}; p[field] = !p[field]; p.updated_at = Date.now(); ev('pref_' + field, 'scenario', sid, { value: p[field] }); save(); render(); };

// ---------- отрисовка ----------
const chip = (label, onclick, on) => `<button class="chip wide ${on ? 'on' : ''}" style="margin-bottom:8px" onclick="${onclick}">${esc(label)}</button>`;
function cardFor(offerId, withActions) {
  const o = byId(D.offers, offerId); const s = PACK.byId[o.scenario_id]; const v = TV.variantFor(s, o.context);
  const n = RUN && RUN.node; const ui = (RUN && RUN.ui) || {};
  let actions = '';
  if (withActions) {
    if (ui.declineFor === offerId) actions = `<div class="sub" style="margin:8px 0">Что не так?</div><div class="chips">${PACK.taxonomy.decline_reasons.map(r => `<button class="chip" onclick="offerDecline('${offerId}','${r.key}')">${r.label}</button>`).join('')}</div>`;
    else if (ui.planFor === offerId) { const def = (D.profile && D.profile.usual_drink_time) || '19:00';
      actions = `<label>Во сколько напомнить?</label><div class="row"><input type="time" id="plt" value="${def}"><button class="small" style="flex:0" onclick="offerPlan('${offerId}')">Готово</button></div>`; }
    else actions = `<div class="row" style="margin-top:10px">${n.offer.allow_now !== false ? `<button onclick="offerNow('${offerId}')">Сейчас</button>` : ''}${n.offer.allow_plan ? `<button onclick="offerPlanUI('${offerId}')">Запланировать</button>` : ''}<button onclick="offerDeclineUI('${offerId}')">Не то</button></div>`;
  }
  return `<div class="card"><div class="sub">${esc(TX.categories[s.category])}${s.category === 'alcohol_shift' ? '' : ` · ${s.duration_min}–${s.duration_max} мин`}</div><h2 style="margin:4px 0 6px">${esc(s.title)}</h2><div>${esc(v.text)}</div>${actions}</div>`;
}
V.flow = () => {
  if (!RUN || !RUN.node) return '<div class="wrap"><div class="card">Нет активного сценария.</div></div>';
  const n = RUN.node; const ctx = RUN.session.context; const vars = Object.assign({}, RUN.vars);
  const head = `<header><h1>${esc(RUN.flow.title)}</h1></header><div class="wrap">`;
  if (n.type === 'question') {
    const txt = n.text_if && Object.keys(n.text_if).find(k => ctx[k]) ? n.text_if[Object.keys(n.text_if).find(k => ctx[k])] : n.text;
    return head + `<div class="card"><div style="font-size:18px;margin-bottom:12px">${esc(TV.fill(txt, vars))}</div>${n.options.filter(o => !o.if || ctx[o.if]).map(o => chip(o.label, `qAnswer('${o.key}')`)).join('')}</div></div>`;
  }
  if (n.type === 'offer') return head + `<div class="sub" style="margin:6px 4px">${esc(n.text)}</div>${RUN.visible.map(id => cardFor(id, true)).join('')}<button style="margin-top:6px" onclick="offerNone()">Ничего не подходит</button></div>`;
  if (n.type === 'instruction') {
    const o = byId(D.offers, RUN.selected); const s = PACK.byId[o.scenario_id]; const v = TV.variantFor(s, ctx); const pr = D.prefs[s.id] || {};
    return head + `<div class="card"><h2 style="margin-top:0">${esc(s.title)}</h2><div style="font-size:17px">${esc(v.text)}</div>
      ${(v.steps || []).length ? `<ol style="padding-left:20px">${v.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      <div class="sub" style="margin-top:8px">${esc(v.stop_permission || '')}</div>
      ${s.action === 'open_voice' ? `<button style="margin-top:10px" onclick="go('voice')">🎙 Записать голосом</button>` : ''}</div>
      <button class="main" onclick="instrDone()">${esc(n.done_label || 'Готово, попробовал')}</button>
      ${n.on.later && n.on.later !== n.on.done || !n.schedule_followup ? `<button style="margin-top:8px" onclick="instrLater()">Сделаю — спроси потом</button>` : ''}
      <div class="row" style="margin-top:8px"><button class="small" onclick="togglePref('${s.id}','favorite')">${pr.favorite ? '★ В избранном' : '☆ В избранное'}</button><button class="small" onclick="togglePref('${s.id}','blocked')">${pr.blocked ? 'Снова предлагать' : 'Больше не предлагать'}</button></div></div>`;
  }
  if (n.type === 'feedback') return head + feedbackForm(RUN.selected, 'fbSaveFlow') + '</div>';
  if (n.type === 'end') return head + `<div class="card" style="font-size:17px">${esc(TV.fill(n.text, vars))}</div>
    ${n.action === 'timer' ? `<div class="card"><div class="timer" id="tm">10:00</div><button onclick="startTimer(600)">Запустить 10 минут</button></div>` : ''}
    <button class="main" onclick="tab('home')">На главную</button></div>`;
  return head + '</div>';
};

// ---------- обратная связь ----------
let FB = {};
function feedbackForm(offerId, saveFn) {
  const s = scen(offerId); const o = byId(D.offers, offerId); if (FB.offer_id !== offerId) FB = { offer_id: offerId, tried: null, result: null, craving_after: null, note: '' };
  const ask = s.followup && s.followup.ask_craving;
  const b = (f, v, l) => `<button class="chip ${FB[f] === v ? 'on' : ''}" onclick="FB.${f}='${v}';render()">${l}</button>`;
  return `<div class="card"><div class="sub">${esc(s.title)}</div>
    <label>Получилось попробовать?</label><div class="chips">${b('tried', 'yes', 'Да')}${b('tried', 'partly', 'Частично')}${b('tried', 'no', 'Нет')}</div>
    <label>${esc((s.followup && s.followup.question) || 'Как ты сейчас?')}</label><div class="chips">${b('result', 'better', 'Лучше')}${b('result', 'same', 'Так же')}${b('result', 'worse', 'Хуже')}</div>
    ${ask ? `<label>Желание выпить сейчас: <b id="cav">${FB.craving_after == null ? '—' : FB.craving_after}</b>/10 (если хочешь отметить)</label><input type="range" min="0" max="10" value="${FB.craving_after == null ? 5 : FB.craving_after}" oninput="FB.craving_after=+this.value;cav.textContent=this.value">` : ''}
    <label>Заметка (по желанию)</label><textarea oninput="FB.note=this.value">${esc(FB.note)}</textarea></div>
    <button class="main" onclick="${saveFn}()">Сохранить</button><button style="margin-top:8px" onclick="${saveFn}(true)">Пропустить</button>`;
}
function storeFeedback(skip) {
  const offerId = FB.offer_id;
  cancelPrompts(p => p.kind === 'followup' && p.offer_id === offerId);
  if (skip) { ev('feedback_skipped', 'offer', offerId, {}); FB = {}; return; }
  const prompt = D.prompts.filter(p => p.offer_id === offerId && p.kind === 'followup').pop();
  const f = TV.stamp({ offer_id: offerId, tried: FB.tried, result: FB.result, craving_after: FB.craving_after, drank_tonight: null, cans: null,
    note: FB.note || null, asked_at: prompt ? prompt.fire_at : Date.now(), answered_at: Date.now() });
  D.feedback.push(f); ev('feedback', 'offer', offerId, { tried: f.tried, result: f.result }); FB = {}; save();
}
window.fbSaveFlow = skip => { storeFeedback(skip); enterNode(RUN.node.on.done); };
V.fb = () => `<header><h1>Как прошло?</h1></header><div class="wrap">${feedbackForm(st.offer, 'fbSaveAlone')}</div>`;
window.fbSaveAlone = skip => { storeFeedback(skip); save(); goBack(); };

// ---------- анкета ----------
let PR = null;
const Q = [
  ['can_leave_home_evening', 'Вечером обычно можешь выйти из дома?', [['yes', 'Да'], ['sometimes', 'Иногда'], ['no', 'Нет']]],
  ['care_duties', 'Вечером на тебе забота о ком-то?', [['none', 'Нет'], ['kids', 'Дети'], ['other', 'Другие обязанности']]],
  ['typical_free_min', 'Сколько свободного времени обычно есть вечером?', [[5, 'Минут 5'], [15, 'Минут 15'], [40, '40 и больше']]],
  ['budget', 'Тратить деньги на вечер?', [[0, 'Только бесплатно'], [1, 'Немного можно'], [2, 'По ситуации']]],
  ['has_close_person', 'Есть кому написать или позвонить без повода?', [[true, 'Да'], [false, 'Сейчас нет']]],
  ['novelty_readiness', 'Насколько готов пробовать непривычное?', [[1, 'Лучше привычное'], [2, 'Иногда можно'], [3, 'Люблю странное']]]
];
const QM = [
  ['social_pref', 'С кем легче отдыхать?', [['solo', 'Одному'], ['with_close', 'С близким'], ['among_people', 'Среди людей, без общения']]],
  ['dislikes', 'Что точно не предлагать?', PACK.taxonomy.tags.map(t => [t.key, t.label])],
  ['constraints', 'Ограничения', PACK.taxonomy.constraints.map(t => [t.key, t.label])],
  ['liked_before', 'Что раньше нравилось, но давно не делал?', PACK.taxonomy.tags.map(t => [t.key, t.label])],
  ['curious_to_try', 'Что обычно не выбираешь, но попробовать любопытно?', PACK.taxonomy.tags.map(t => [t.key, t.label])]
];
V.profile = () => {
  if (!PR) PR = Object.assign({ social_pref: [], dislikes: [], constraints: [], liked_before: [], curious_to_try: [], usual_drink_time: '19:00' }, JSON.parse(JSON.stringify(D.profile || {})));
  const one = ([f, q, opts]) => `<label>${q}</label><div class="chips">${opts.map(([v, l]) => `<button class="chip ${PR[f] === v ? 'on' : ''}" onclick='PR["${f}"]=${JSON.stringify(v)};render()'>${l}</button>`).join('')}</div>`;
  const many = ([f, q, opts]) => `<label>${q}</label><div class="chips">${opts.map(([v, l]) => `<button class="chip ${PR[f].includes(v) ? 'on' : ''}" onclick='prTog("${f}",${JSON.stringify(v)})'>${l}</button>`).join('')}</div>`;
  return `<header><h1>Обо мне</h1><div class="sub">Минута — и подбор станет точнее. Любой вопрос можно пропустить.</div></header><div class="wrap"><div class="card">
    ${Q.map(one).join('')}${QM.map(many).join('')}
    <label>Во сколько обычно хочется выпить?</label><input type="time" value="${PR.usual_drink_time}" onchange="PR.usual_drink_time=this.value"></div>
    <button class="main" onclick="saveProfile()">Сохранить</button></div>`;
};
window.prTog = (f, v) => { const a = PR[f]; const i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1); render(); };
window.saveProfile = () => {
  const first = !D.profile;
  D.profile = first ? TV.stamp(Object.assign({ questionnaire_version: 1, completed_at: Date.now() }, PR)) : TV.touch(Object.assign(D.profile, PR, { completed_at: D.profile.completed_at || Date.now() }));
  // напоминание «перед вечером» — за час до обычного времени, если пользователь его не менял
  const pre = D.reminders.find(r => r.k === 'pre');
  if (pre && !pre.custom && PR.usual_drink_time) { const [h, m] = PR.usual_drink_time.split(':').map(Number); const t = (h * 60 + m - 60 + 1440) % 1440; pre.t = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  ev(first ? 'profile_created' : 'profile_updated', 'profile', D.profile.id, {}); PR = null; save(); saveRem(); goBack();
};

// ---------- приветствие ----------
V.welcome = () => `<header><h1>Новое: вечер иначе</h1></header><div class="wrap">
  <div class="card">Теперь приложение не только записывает тягу, но и само предлагает, как провести вечер иначе: маленькие приключения, уют, книги, музыку, движение. Днём — до того, как решение уже принято.</div>
  <div class="warn">Это поддержка в изменении привычки, а не лечение. Приложение для взрослых 18+. Оно не подходит для самостоятельной отмены алкоголя при длительном ежедневном употреблении: если при сокращении появляются дрожь, потливость, тревога, бессонница, галлюцинации — нужен врач-нарколог.</div>
  <button class="main" style="margin-top:12px" onclick="welcomeDone(true)">Мне есть 18 — заполнить анкету</button>
  <button style="margin-top:8px" onclick="welcomeDone(false)">Мне есть 18 — позже</button></div>`;
window.welcomeDone = p => { D.onboarded_at = Date.now(); ev('onboarded', 'store', D.install_id, { adult_confirmed: true }); save(); resetStack('home'); if (p) go('profile'); else render(); };

// ---------- мои сценарии ----------
V.myscen = () => {
  const stt = TV.scenarioStats(D); const all = st.all;
  const list = PACK.scenarios.filter(s => all || stt[s.id] || D.prefs[s.id]);
  return `<header><h1>Мои сценарии</h1><div class="sub">Показано / попробовал / стало лучше</div></header><div class="wrap">
    <button class="small" onclick="st.all=!st.all;render()">${all ? 'Только мои' : 'Вся библиотека'}</button>
    ${list.map(s => { const x = stt[s.id] || {}; const p = D.prefs[s.id] || {};
      return `<div class="card hist"><div class="t">${esc(TX.categories[s.category])}</div><b>${esc(s.title)}</b> <span class="sub">${x.shown || 0} / ${x.tried || 0} / ${x.better || 0}</span>
      <div class="row" style="margin-top:6px"><button class="small" onclick="togglePref('${s.id}','favorite')">${p.favorite ? '★' : '☆'} избранное</button><button class="small" onclick="togglePref('${s.id}','blocked')">${p.blocked ? 'скрыт — вернуть' : 'не предлагать'}</button></div></div>`; }).join('') || '<div class="card">Пока ничего не показывалось.</div>'}</div>`;
};

// ---------- вставки в существующие экраны ----------
window.homeExtra = () => {
  const pl = plannedToday(); const pend = pendingFeedback().slice(0, 2);
  return `<button class="main" style="margin-top:10px;background:var(--ok)" onclick="startFlow('craving_button')">Провести вечер иначе</button>
  ${!D.profile ? `<div class="card" onclick="go('profile')"><b>Расскажи о себе за минуту</b><div class="sub">Чтобы не предлагать то, что не подходит.</div></div>` : ''}
  <div class="card">${pl ? `<div class="sub">План на вечер · ${hhmm(pl.resp.planned_for)}</div><b>${esc(pl.s.title)}</b><div>${esc(TV.variantFor(pl.s, pl.offer.context).text)}</div>
    <div class="row" style="margin-top:8px"><button onclick="startFlow('pre_evening',{trigger:'plan_reminder',context:{use_planned:true},node:'i_do'})">Сделать сейчас</button><button onclick="cancelPlan('${pl.resp.id}')">Отменить</button></div>`
    : `<b>План на вечер</b><div class="sub">Пока решение ещё не принято — выбери, как хочется провести вечер.</div><button style="margin-top:8px" onclick="startFlow('day_plan',{trigger:'manual'})">Спланировать вечер</button>`}</div>
  ${pend.map(p => `<div class="card" onclick="go('fb',{offer:'${p.offer.id}'})"><div class="sub">Как прошло?</div><b>${esc(p.s.title)}</b> ›</div>`).join('')}`;
};
window.cancelPlan = rid => { const r = byId(D.responses, rid); r.cancelled = true; TV.touch(r); cancelPrompts(p => p.response_id === rid); ev('plan_cancelled', 'response', rid, {}); syncProactive(); save(); render(); };
window.morningExtra = () => {
  const y = new Date(); y.setDate(y.getDate() - 1); const yk = TV.localDate(y.getTime());
  const items = D.responses.filter(r => r.action === 'accepted' && !r.deleted_at && TV.localDate(r.created_at) === yk && !fbFor(r.offer_id));
  if (!items.length) return '';
  return `<div class="card"><div class="sub">Вчера ты выбрал — получилось?</div>${items.map(r => { const s = scen(r.offer_id);
    return `<div style="margin-top:8px"><b>${esc(s.title)}</b><div class="chips" style="margin-top:6px"><button class="chip" onclick="quickTried('${r.offer_id}','yes',this)">Да</button><button class="chip" onclick="quickTried('${r.offer_id}','partly',this)">Частично</button><button class="chip" onclick="quickTried('${r.offer_id}','no',this)">Нет</button></div></div>`; }).join('')}</div>`;
};
window.quickTried = (offerId, v, el) => { D.feedback.push(TV.stamp({ offer_id: offerId, tried: v, result: null, craving_after: null, drank_tonight: null, cans: null, note: null, asked_at: Date.now(), answered_at: Date.now(), source: 'morning' })); ev('feedback', 'offer', offerId, { tried: v, source: 'morning' }); save(); el.parentNode.innerHTML = '<span class="done">✓ записано</span>'; };
// итог дня: связать «пил сегодня» с сегодняшними сценариями
window.onNightCheck = e => {
  if (e.drank == null) return;
  D.responses.filter(r => r.action === 'accepted' && TV.localDate(r.created_at) === today()).forEach(r => {
    let f = fbFor(r.offer_id);
    if (!f) { f = TV.stamp({ offer_id: r.offer_id, tried: null, result: null, craving_after: null, note: null, asked_at: Date.now(), answered_at: null, source: 'night' }); D.feedback.push(f); }
    f.drank_tonight = e.drank ? 'yes' : 'no'; f.cans = e.drank ? e.cans : 0; TV.touch(f);
  });
};
window.adviceExtra = e => `<button class="main" style="background:var(--ok)" onclick="startFromCraving('${e.id}')">Попробовать что-то другое</button>`;
window.startFromCraving = id => { const e = D.entries.find(x => x.id === id) || {}; startFlow('craving_button', { context: { need: WANT2NEED[(e.wants || [])[0]] || null, craving_before: e.intensity }, craving_entry_id: id }); };
window.statsExtra = () => {
  const stt = TV.scenarioStats(D); const rows = Object.entries(stt).filter(([, x]) => x.better).sort((a, b) => b[1].better - a[1].better).slice(0, 5);
  const shown = D.offers.length, acc = D.responses.filter(r => r.action === 'accepted').length, tried = D.feedback.filter(f => f.tried === 'yes' || f.tried === 'partly').length, better = D.feedback.filter(f => f.result === 'better').length;
  const reasons = {}; D.responses.filter(r => r.decline_reason).forEach(r => reasons[r.decline_reason] = (reasons[r.decline_reason] || 0) + 1);
  return `<div class="card"><h2 style="margin-top:0">Вечера иначе</h2><div class="row"><div class="stat"><b>${shown}</b><span>предложено</span></div><div class="stat"><b>${acc}</b><span>выбрано</span></div><div class="stat"><b>${tried}</b><span>попробовал</span></div><div class="stat"><b>${better}</b><span>стало лучше</span></div></div></div>
  <div class="card"><h2 style="margin-top:0">Что помогало</h2>${rows.map(([id, x]) => `<div>${esc(PACK.byId[id] ? PACK.byId[id].title : id)} — ${x.better}</div>`).join('') || '<div class="sub">пока нет данных</div>'}</div>
  <div class="card"><h2 style="margin-top:0">Почему отказывался</h2>${Object.entries(reasons).map(([k, v]) => `<div>${esc(TX.decline_reasons[k])} — ${v}</div>`).join('') || '<div class="sub">нет данных</div>'}</div>`;
};
window.settingsExtra = () => `<div class="card"><h2 style="margin-top:0">Вечер иначе</h2>
  <button onclick="go('profile')">Обо мне (анкета)</button><button style="margin-top:8px" onclick="go('myscen')">Мои сценарии</button>
  <label>Не больше проактивных напоминаний в день</label><div class="chips">${[1, 2, 3].map(n => `<button class="chip ${D.proactive.max_daily === n ? 'on' : ''}" onclick="D.proactive.max_daily=${n};saveProactive()">${n}</button>`).join('')}</div>
  <label>Тихие часы</label><div class="row"><input type="time" value="${D.proactive.quiet_from}" onchange="D.proactive.quiet_from=this.value;saveProactive()"><input type="time" value="${D.proactive.quiet_to}" onchange="D.proactive.quiet_to=this.value;saveProactive()"></div>
  <label><input type="checkbox" ${D.proactive.followups ? 'checked' : ''} onchange="D.proactive.followups=this.checked;saveProactive()" style="width:20px;height:20px;vertical-align:middle"> Спрашивать «как прошло» после занятия</label>
  <div class="sub" style="margin-top:8px">Пакет сценариев: ${PACK.pack_id} ${PACK.version}, ${PACK.scenarios.length} шт.</div></div>
  <div class="card"><h2 style="margin-top:0">Удалить всё</h2><div class="sub">Сотрёт дневник, записи голоса, анкету и историю сценариев на этом телефоне. Сначала можно выгрузить.</div><button class="danger" style="margin-top:8px" onclick="wipeAll()">Удалить всю историю</button></div>`;
window.saveProactive = () => { ev('proactive_updated', 'store', D.install_id, D.proactive); save(); syncProactive(); render(); };
window.wipeAll = () => {
  if (!confirm('Удалить всю историю? Это нельзя отменить.') || !confirm('Точно удалить?')) return;
  D.prompts.filter(p => p.status === 'scheduled').forEach(p => HAS && Android.cancelOnce && Android.cancelOnce(p.id));
  if (HAS && Android.wipe) Android.wipe(); else localStorage.removeItem('d');
  const rem = D.reminders; D = TV.migrate({ reminders: rem, reasons: [], ritual: D.ritual }); D.onboarded_at = Date.now(); save(); syncProactive(); tab('home');
};
window.mdExtra = () => {
  const L = ['', '## Вечера иначе (сценарии)', `Пакет: ${PACK.pack_id} ${PACK.version}`];
  for (const s of [...D.sessions].sort((a, b) => a.started_at - b.started_at)) {
    const offers = D.offers.filter(o => o.session_id === s.id);
    const parts = offers.map(o => { const r = respFor(o.id).map(x => x.action === 'declined' ? 'отказ: ' + (TX.decline_reasons[x.decline_reason] || '') : x.action).join(', '); const f = fbFor(o.id);
      return `${(PACK.byId[o.scenario_id] || {}).title || o.scenario_id} [${r || '—'}]${f ? ` → попробовал: ${f.tried || '—'}, результат: ${f.result || '—'}${f.craving_after != null ? ', тяга после ' + f.craving_after : ''}` : ''}`; });
    L.push(`- ${new Date(s.started_at).toLocaleString('ru-RU')} — ${(PACK.flowsById[s.flow_id] || {}).title || s.flow_id} (${s.outcome || 'не завершён'}): ${parts.join('; ') || 'без предложений'}`);
  }
  return L.join('\n');
};
window.exportScenariosJson = () => JSON.stringify({ schema_version: D.schema_version, install_id: D.install_id, pack: { id: PACK.pack_id, version: PACK.version },
  profile: D.profile, proactive: D.proactive, sessions: D.sessions, offers: D.offers, responses: D.responses, feedback: D.feedback, prompts: D.prompts, prefs: D.prefs, events: D.events }, null, 1);
window.onLeave = s => { if (s === 'flow' && RUN && !RUN.session.ended_at) endSession('abandoned'); };
window.openScenarioNotification = k => {
  if (k === 'plan') { startFlow('day_plan', { trigger: 'day_plan' }); return true; }
  if (k === 'pre') { startFlow('pre_evening', { trigger: 'pre_evening' }); return true; }
  if (k.startsWith('fb:')) { const id = k.slice(3); D.prompts.filter(p => p.offer_id === id && p.kind === 'followup').forEach(p => { p.status = 'opened'; TV.touch(p); }); if (fbFor(id)) { tab('home'); return true; } go('fb', { offer: id }); return true; }
  if (k.startsWith('do:')) { const id = k.slice(3); D.prompts.filter(p => p.offer_id === id && p.kind === 'plan_reminder').forEach(p => { p.status = 'opened'; TV.touch(p); });
    startFlow('pre_evening', { trigger: 'plan_reminder', context: { use_planned: true }, node: 'i_do' }); return true; }
  return false;
};

// ---------- самотест сценариев ----------
window.selfTestScenarios = async (ok, sleep) => {
  ok(PACK.scenarios.length >= 30, 'pack loaded ' + PACK.scenarios.length);
  ok(TV.validatePack(PACK).length === 0, 'pack valid');
  D.profile = null; tab('home'); ok(document.body.innerHTML.includes('Провести вечер иначе'), 'home has scenario button');
  // анкета
  go('profile'); PR.can_leave_home_evening = 'no'; PR.dislikes = ['photo']; PR.budget = 0; saveProfile(); ok(D.profile && D.profile.can_leave_home_evening === 'no', 'profile saved');
  // план дня → запланировать
  startFlow('day_plan', { trigger: 'manual' }); ok(RUN.node.id === 'q_need', 'day_plan starts');
  qAnswer('novelty'); qAnswer('mid'); ok(RUN.node.type === 'offer' && RUN.visible.length === 2, 'two offers after skipped setting');
  RUN.visible.forEach(id => { const s = scen(id); ok(s.setting !== 'outdoors' && !s.tags.includes('photo') && s.cost === 0, 'respects profile ' + s.id); });
  const c0 = scen(RUN.visible[0]).category, c1 = scen(RUN.visible[1]).category; ok(c0 !== c1, 'different categories');
  const first = RUN.visible[0]; offerDecline(first, 'dislike'); ok(RUN.visible.length === 2 && !RUN.visible.includes(first), 'decline replaces card');
  const toPlan = RUN.visible[0]; offerPlanUI(toPlan); document.getElementById('plt').value = '23:58'; offerPlan(toPlan);
  ok(RUN.node.id === 'e_planned' && document.body.innerHTML.includes('Записал'), 'planned end');
  ok(D.prompts.some(p => p.kind === 'plan_reminder' && p.offer_id === toPlan), 'plan reminder scheduled');
  tab('home'); ok(document.body.innerHTML.includes('План на вечер ·'), 'home shows plan');
  // уведомление «сделать запланированное» → инструкция → обратная связь
  openScenarioNotification('do:' + toPlan); ok(RUN.node.type === 'instruction' && RUN.selected === toPlan, 'planned → instruction');
  instrDone(); ok(RUN.node.type === 'feedback', 'feedback node'); FB.tried = 'yes'; FB.result = 'better'; fbSaveFlow();
  ok(fbFor(toPlan) && fbFor(toPlan).result === 'better', 'feedback saved'); ok(RUN.session.outcome === 'completed', 'session completed');
  // кнопка на экране совета после отметки тяги
  const ce = D.entries.find(x => x.type === 'craving');
  if (ce) { go('advice', { e: ce }); const btn = [...document.querySelectorAll('button')].find(x => x.textContent === 'Попробовать что-то другое'); ok(!!btn, 'advice has scenario button'); btn.click();
    ok(RUN && RUN.flow.id === 'craving_button' && RUN.session.craving_entry_id === ce.id, 'advice → craving flow'); }
  // тяга → ничего не подходит → всё равно выпью
  startFlow('craving_button', { context: { craving_before: 8 } }); qAnswer('no'); qAnswer('switch_off'); qAnswer('low');
  ok(RUN.node.id === 'o_main', 'craving offers'); offerNone(); ok(RUN.node.id === 'q_still', 'none fit → still'); qAnswer('drink');
  ok(RUN.flow.id === 'still_drink', 'redirect to still_drink'); qAnswer('ok'); ok(RUN.visible.every(id => scen(id).category === 'alcohol_shift'), 'only alcohol_shift');
  offerNow(RUN.visible[0]); instrDone(); ok(RUN.node.id === 'e_later', 'still_drink end');
  ok(D.prompts.some(p => p.kind === 'followup' && p.offer_id === RUN.selected), 'followup scheduled');
  // после употребления — без улицы и нагрузки
  D.profile.can_leave_home_evening = 'yes'; startFlow('craving_button'); qAnswer('yes'); qAnswer('movement'); qAnswer('high');
  ok(RUN.visible.every(id => scen(id).intoxicated_ok), 'intoxicated safe offers');
  goBack(); ok(D.sessions[D.sessions.length - 1].outcome === 'abandoned', 'leave = abandoned');
  ok(D.offers.every(o => o.ranker_id && o.scenario_revision && o.features), 'offers have ranker & features');
  tab('stats'); ok(document.body.innerHTML.includes('Вечера иначе'), 'stats extra');
  go('myscen'); ok(document.body.innerHTML.includes('Мои сценарии'), 'myscen');
  ok(mdExtra().includes('Вечера иначе'), 'md extra'); ok(JSON.parse(exportScenariosJson()).offers.length === D.offers.length, 'scenarios json');
  D.prompts.filter(p => p.status === 'scheduled').forEach(p => HAS && Android.cancelOnce && Android.cancelOnce(p.id));
};

// ---------- старт ----------
refreshPrompts(); syncProactive(); save();
if (!D.onboarded_at && !location.search.includes('selftest')) resetStack('welcome');
render();
