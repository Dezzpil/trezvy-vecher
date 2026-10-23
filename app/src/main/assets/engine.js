// Трезвый вечер — движок сценариев (без UI). Работает в WebView и в Node (тесты).
(function (root) {
  'use strict';
  const SCHEMA_VERSION = 2;
  const RANKER_ID = 'rules-v1';
  const DAY = 86400000;

  // ---------- идентификаторы и время ----------
  function uuid() {
    const c = root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    let d = Date.now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = (d + Math.random() * 16) % 16 | 0; d = Math.floor(d / 16);
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function localDate(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Общие поля любой пользовательской записи (готовность к синхронизации)
  function stamp(rec, now) {
    now = now || Date.now();
    return Object.assign({ id: uuid(), created_at: now, updated_at: now, deleted_at: null, sync_state: 'local',
      schema_version: SCHEMA_VERSION, tz_offset_min: -new Date(now).getTimezoneOffset(), local_date: localDate(now) }, rec);
  }
  function touch(rec, now) { rec.updated_at = now || Date.now(); if (rec.sync_state === 'synced') rec.sync_state = 'pending'; return rec; }

  // ---------- миграция данных v1 -> v2 ----------
  const DEFAULT_PROACTIVE = { max_daily: 2, quiet_from: '23:00', quiet_to: '09:00', followups: true };
  function migrate(D, now) {
    now = now || Date.now();
    D.entries = D.entries || [];
    if (!D.install_id) D.install_id = uuid();
    for (const e of D.entries) {
      if (e.created_at == null) { e.created_at = e.ts; e.updated_at = e.outcomeTs || e.ts; e.deleted_at = null; e.sync_state = 'local'; e.local_date = localDate(e.ts); }
    }
    for (const k of ['sessions', 'offers', 'responses', 'feedback', 'prompts', 'events']) D[k] = D[k] || [];
    D.prefs = D.prefs || {};               // scenario_id -> {favorite, blocked, updated_at}
    D.profile = D.profile || null;
    D.proactive = Object.assign({}, DEFAULT_PROACTIVE, D.proactive || {});
    D.reminders = D.reminders || [];
    if (!D.reminders.find(r => r.k === 'plan')) D.reminders.splice(1, 0, { t: '14:00', k: 'plan', on: true });
    if (!D.reminders.find(r => r.k === 'pre')) D.reminders.splice(3, 0, { t: '18:00', k: 'pre', on: true });
    if ((D.schema_version || 1) < SCHEMA_VERSION) {
      D.events.push(stamp({ ts: now, type: 'migrated', entity: 'store', entity_id: D.install_id, payload: { from: D.schema_version || 1, to: SCHEMA_VERSION } }, now));
      D.schema_version = SCHEMA_VERSION;
    }
    return D;
  }
  function logEvent(D, type, entity, entity_id, payload, now, app_version) {
    const e = stamp({ ts: now || Date.now(), type, entity, entity_id, payload: payload || {}, app_version: app_version || null }, now);
    D.events.push(e); return e;
  }

  // ---------- пакет контента ----------
  function indexPack(pack) {
    const byId = {}; for (const s of pack.scenarios) byId[s.id] = s;
    const flows = {}; for (const f of pack.flows) { const nodes = {}; for (const n of f.nodes) nodes[n.id] = n; flows[f.id] = Object.assign({}, f, { byNode: nodes }); }
    return Object.assign({}, pack, { byId, flowsById: flows });
  }
  function variantFor(s, ctx) {
    ctx = ctx || {};
    const v = k => (s.variants || []).find(x => x.key === k);
    const def = v('default') || s.variants[0];
    if (ctx.energy === 1 && v('low_energy')) return v('low_energy');
    const t = ctx.time;
    if (t != null && t < s.duration_min && v('short')) return v('short');
    return def;
  }
  function minDuration(s, variant) { return variant && variant.duration_min != null ? variant.duration_min : s.duration_min; }

  // ---------- статистика пользователя по сценариям ----------
  function scenarioStats(D, now) {
    now = now || Date.now();
    const st = {};
    const get = id => st[id] || (st[id] = { shown: 0, accepted: 0, planned: 0, declined: 0, dislike: 0, bored: 0, tried: 0, better: 0, same: 0, worse: 0, better_w: 0, last_shown_at: 0, last_reason: null });
    const offers = {}; for (const o of D.offers) { if (o.deleted_at) continue; offers[o.id] = o; const s = get(o.scenario_id); s.shown++; s.last_shown_at = Math.max(s.last_shown_at, o.shown_at); }
    for (const r of D.responses) {
      const o = offers[r.offer_id]; if (!o || r.deleted_at) continue; const s = get(o.scenario_id);
      if (r.action === 'accepted') s.accepted++;
      if (r.action === 'planned') s.planned++;
      if (r.action === 'declined') { s.declined++; s.last_reason = r.decline_reason; if (r.decline_reason === 'dislike') s.dislike++; if (r.decline_reason === 'bored') s.bored++; }
    }
    for (const f of D.feedback) {
      const o = offers[f.offer_id]; if (!o || f.deleted_at) continue; const s = get(o.scenario_id);
      if (f.tried === 'yes' || f.tried === 'partly') s.tried++;
      if (f.result === 'better') { s.better++; s.better_w += Math.pow(0.85, (now - (f.answered_at || now)) / (7 * DAY)); }
      if (f.result === 'same') s.same++;
      if (f.result === 'worse') s.worse++;
    }
    return st;
  }

  // ---------- подбор (rules-v1) ----------
  // ctx: {need, energy(1..3), time(мин), setting('home'|'any'), intoxicated}
  // opts: {category, max_effort, exclude_ids[], exclude_categories[], now, rng, exploration}
  function eligibility(s, ctx, profile, prefs, stats, opts) {
    const p = profile || {};
    const v = variantFor(s, ctx);
    if (s.status !== 'active') return 'inactive';
    if (opts.category) { if (s.category !== opts.category) return 'category'; }
    else if (s.category === 'alcohol_shift') return 'category';
    if ((opts.exclude_ids || []).includes(s.id)) return 'session_shown';
    if (prefs[s.id] && prefs[s.id].blocked) return 'blocked';
    const stt = stats[s.id]; if (stt && stt.dislike >= 2) return 'disliked';
    if (ctx.intoxicated && !s.intoxicated_ok) return 'intoxicated';
    const homeOnly = ctx.setting === 'home' || p.can_leave_home_evening === 'no';
    if (homeOnly && s.setting === 'outdoors') return 'setting';
    if (s.requires.includes('can_leave_home') && homeOnly) return 'requires';
    if (s.requires.includes('close_person') && p.has_close_person === false) return 'requires';
    if (ctx.time != null && minDuration(s, v) > ctx.time) return 'duration';
    if (opts.max_effort && s.effort > opts.max_effort) return 'effort';
    const budget = p.budget != null ? p.budget : 1;
    if (s.cost > budget) return 'cost';
    if ((p.dislikes || []).some(t => s.tags.includes(t) || t === s.category)) return 'dislikes';
    if ((s.excludes_if || []).some(c => (p.constraints || []).includes(c))) return 'constraint';
    if (s.social !== 'solo' && p.social_pref && p.social_pref.length && !p.social_pref.includes(s.social)) return 'social';
    return null;
  }

  function scoreOne(s, ctx, profile, prefs, stats, now, recentDays) {
    const p = profile || {}; const st = stats[s.id] || {};
    const f = {
      need_match: ctx.need && s.needs.includes(ctx.need) ? 1 : 0,
      better_w: +(st.better_w || 0).toFixed(3), worse: st.worse || 0, accepted: st.accepted || 0, tried: st.tried || 0,
      shown: st.shown || 0, bored: st.bored || 0, dislike: st.dislike || 0,
      recent: st.last_shown_at && now - st.last_shown_at < recentDays * DAY ? 1 : 0,
      effort: s.effort, novelty: s.novelty, energy: ctx.energy || null,
      liked_tag: s.tags.some(t => (p.liked_before || []).includes(t)) ? 1 : 0,
      curious_tag: s.tags.some(t => (p.curious_to_try || []).includes(t)) ? 1 : 0,
      favorite: prefs[s.id] && prefs[s.id].favorite ? 1 : 0,
      hour: new Date(now).getHours(), weekday: new Date(now).getDay(), setting: ctx.setting || null, intoxicated: !!ctx.intoxicated,
      category: s.category
    };
    let score = 0;
    score += 3 * f.need_match;
    score += 2 * f.better_w;
    score -= 1.5 * f.worse;
    score += 0.5 * Math.min(f.accepted, 4) + 0.5 * Math.min(f.tried, 4);
    score -= 2.5 * f.dislike + 1 * f.bored;
    score -= 2 * f.recent;
    if (ctx.energy === 1) score -= (s.effort - 1) * 1.5;
    if (ctx.energy === 3) score += (s.effort - 1) * 0.3;
    if (ctx.need === 'novelty') score += (s.novelty - 1) * 0.7;
    const readiness = p.novelty_readiness || 2;
    if (s.novelty > readiness) score -= (s.novelty - readiness);
    score += f.liked_tag + 0.5 * f.curious_tag + 2 * f.favorite;
    if (ctx.need === 'company' && s.social !== 'solo') score += 1;
    return { score: +score.toFixed(3), features: f };
  }

  function rank(pack, D, ctx, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const stats = scenarioStats(D, now); const profile = D.profile; const prefs = D.prefs || {};
    let items = [];
    const excluded = {};
    for (const s of pack.scenarios) {
      const why = eligibility(s, ctx, profile, prefs, stats, opts);
      if (why) { excluded[s.id] = why; continue; }
      const sc = scoreOne(s, ctx, profile, prefs, stats, now, 3);
      items.push({ scenario_id: s.id, scenario_revision: s.revision, variant_key: variantFor(s, ctx).key, category: s.category, score: sc.score, features: sc.features });
    }
    items.sort((a, b) => b.score - a.score || a.scenario_id.localeCompare(b.scenario_id));
    return { ranker_id: RANKER_ID, items, excluded };
  }

  // Выбрать count вариантов: разные категории, иногда — исследование нового
  function pick(ranked, count, opts) {
    opts = opts || {}; const rng = opts.rng || Math.random; const rate = opts.exploration == null ? 0.15 : opts.exploration;
    const avoidCats = new Set(opts.avoid_categories || []);
    let items = ranked.items.slice();
    // если недавно показанных слишком много — они уже понижены в score; если кандидатов мало — берём что есть
    const out = [];
    const takeBest = (pool) => {
      const diff = pool.find(i => !avoidCats.has(i.category) && !out.some(o => o.category === i.category));
      return diff || pool[0];
    };
    while (out.length < count && items.length) {
      let chosen = null;
      if (out.length > 0 && rng() < rate) {
        const explore = items.filter(i => (i.features.shown === 0 || i.features.curious_tag) && !out.some(o => o.category === i.category));
        if (explore.length) { chosen = Object.assign({}, explore[Math.floor(rng() * explore.length)]); chosen.features = Object.assign({}, chosen.features, { explore: 1 }); }
      }
      if (!chosen) { chosen = takeBest(items); chosen = Object.assign({}, chosen, { features: Object.assign({}, chosen.features, { explore: 0 }) }); }
      out.push(chosen);
      items = items.filter(i => i.scenario_id !== chosen.scenario_id);
    }
    return out;
  }

  // Подставить fallback, если основной вариант недоступен (используется UI при «не могу выйти»)
  function fallbackFor(pack, id) { const s = pack.byId[id]; return s && s.fallback_id ? pack.byId[s.fallback_id] : null; }

  // ---------- условия узлов ----------
  function condTrue(cond, ctx, profile) {
    if (!cond) return false;
    return Object.keys(cond).some(k => {
      const [scope, key] = k.split('.'); const src = scope === 'ctx' ? ctx : (profile || {});
      const val = src ? src[key] : undefined; const want = cond[k];
      if (want === '*') return val !== undefined && val !== null;
      return val === want;
    });
  }
  function fill(text, vars) { return String(text || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : ''); }

  // ---------- проверка пакета (CI) ----------
  function validatePack(pack) {
    const errs = []; const T = pack.taxonomy || {};
    const keys = n => new Set((T[n] || []).map(x => x.key));
    const needs = keys('needs'), cats = keys('categories'), tags = keys('tags'), cons = keys('constraints'); const reqs = new Set(T.requires || []);
    const ids = new Set();
    const FORBIDDEN = /(наград|приключени|ещё одн[уа] банк|крепче|новый напиток|коктейл)/i;
    for (const s of pack.scenarios || []) {
      const at = 'scenario ' + s.id;
      if (!s.id || ids.has(s.id)) errs.push(at + ': пустой или повторный id'); ids.add(s.id);
      for (const f of ['title', 'category', 'needs', 'setting', 'duration_min', 'duration_max', 'effort', 'cost', 'social', 'novelty', 'variants', 'revision'])
        if (s[f] === undefined) errs.push(at + ': нет поля ' + f);
      if (!cats.has(s.category)) errs.push(at + ': неизвестная категория ' + s.category);
      (s.needs || []).forEach(n => needs.has(n) || errs.push(at + ': неизвестная потребность ' + n));
      (s.tags || []).forEach(n => tags.has(n) || errs.push(at + ': неизвестный тег ' + n));
      (s.requires || []).forEach(n => reqs.has(n) || errs.push(at + ': неизвестное требование ' + n));
      (s.excludes_if || []).forEach(n => cons.has(n) || errs.push(at + ': неизвестное ограничение ' + n));
      if (!['home', 'outdoors', 'any'].includes(s.setting)) errs.push(at + ': setting');
      if (!['solo', 'with_close', 'among_people'].includes(s.social)) errs.push(at + ': social');
      if (s.duration_min > s.duration_max) errs.push(at + ': duration_min > duration_max');
      if (!(s.variants || []).some(v => v.key === 'default')) errs.push(at + ': нет варианта default');
      (s.variants || []).forEach(v => { if (!['default', 'short', 'low_energy'].includes(v.key) || !v.text) errs.push(at + ': плохой вариант ' + v.key); });
      if (s.setting === 'outdoors' && s.intoxicated_ok) errs.push(at + ': улица после употребления запрещена');
      if (s.category === 'body' && s.effort >= 2 && s.intoxicated_ok) errs.push(at + ': нагрузка после употребления запрещена');
      if (s.category === 'alcohol_shift') {
        if (s.setting === 'outdoors') errs.push(at + ': alcohol_shift только дома');
        (s.variants || []).forEach(v => FORBIDDEN.test(v.text) && errs.push(at + ': запрещённая формулировка'));
      }
      if (s.setting === 'outdoors' && !s.fallback_id) errs.push(at + ': у уличного сценария нужен fallback_id');
    }
    for (const s of pack.scenarios || []) if (s.fallback_id) {
      const fb = (pack.scenarios || []).find(x => x.id === s.fallback_id);
      if (!fb) errs.push('scenario ' + s.id + ': fallback ' + s.fallback_id + ' не найден');
      else if (fb.setting === 'outdoors') errs.push('scenario ' + s.id + ': fallback не должен быть уличным');
    }
    const flowIds = new Set((pack.flows || []).map(f => f.id));
    const TYPES = ['question', 'offer', 'instruction', 'feedback', 'end'];
    for (const f of pack.flows || []) {
      const at = 'flow ' + f.id; const nodes = {}; (f.nodes || []).forEach(n => { if (nodes[n.id]) errs.push(at + ': повтор узла ' + n.id); nodes[n.id] = n; });
      if (!nodes[f.entry_node]) errs.push(at + ': нет entry_node');
      const ref = (to, from) => {
        if (!to) return errs.push(at + '/' + from + ': пустой переход');
        if (to.startsWith('flow:')) { if (!flowIds.has(to.slice(5))) errs.push(at + '/' + from + ': нет сценария ' + to); return; }
        if (!nodes[to]) errs.push(at + '/' + from + ': нет узла ' + to);
      };
      const edges = n => {
        const out = [];
        (n.options || []).forEach(o => out.push(o.next)); if (n.skip_next) out.push(n.skip_next);
        Object.values(n.on || {}).forEach(x => out.push(x)); return out;
      };
      for (const n of f.nodes || []) {
        if (!TYPES.includes(n.type)) errs.push(at + '/' + n.id + ': тип ' + n.type);
        if (n.type === 'question' && !(n.options || []).length) errs.push(at + '/' + n.id + ': вопрос без вариантов');
        if (n.type === 'offer') {
          if (!n.on || !n.on.accepted || !n.on.none_fit) errs.push(at + '/' + n.id + ': у offer нужны on.accepted и on.none_fit');
          if (n.offer && n.offer.allow_plan && !(n.on || {}).planned) errs.push(at + '/' + n.id + ': allow_plan без on.planned');
          if (n.offer && n.offer.category && !cats.has(n.offer.category)) errs.push(at + '/' + n.id + ': категория');
        }
        if (n.type === 'instruction' && !(n.on || {}).done) errs.push(at + '/' + n.id + ': нет on.done');
        if (n.type !== 'end') edges(n).forEach(t => ref(t, n.id));
      }
      // достижимость
      const seen = new Set(); const q = [f.entry_node];
      while (q.length) { const id = q.shift(); if (seen.has(id) || !nodes[id]) continue; seen.add(id); edges(nodes[id]).forEach(t => t && !t.startsWith('flow:') && q.push(t)); }
      Object.keys(nodes).forEach(id => seen.has(id) || errs.push(at + ': недостижимый узел ' + id));
      // instruction/feedback достижимы только после offer
    }
    return errs;
  }

  const api = { SCHEMA_VERSION, RANKER_ID, uuid, localDate, stamp, touch, migrate, logEvent, indexPack, variantFor,
    scenarioStats, eligibility, scoreOne, rank, pick, fallbackFor, condTrue, fill, validatePack };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TV = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
