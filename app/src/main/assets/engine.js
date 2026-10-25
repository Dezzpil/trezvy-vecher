// Трезвый вечер — движок «Равновесия» (без UI). Работает в WebView и в Node (тесты).
// Одна механика: человек находится в каком-то месте → приложение предлагает ход, который
// восполняет недобранную сегодня сторону равновесия → сделанный ход заполняет колесо дня.
(function (root) {
  'use strict';
  const SCHEMA_VERSION = 3;
  const RANKER_ID = 'balance-v1';
  const DAY = 86400000;
  const SECTORS = ['body', 'hands', 'mind', 'people', 'world', 'quiet'];
  const HOME_PLACES = ['sofa', 'room', 'kitchen', 'bath', 'window'];
  const OUT_PLACES = ['stairs', 'road', 'city'];

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
  function stamp(rec, now) {
    now = now || Date.now();
    return Object.assign({ id: uuid(), created_at: now, updated_at: now, deleted_at: null, sync_state: 'local',
      schema_version: SCHEMA_VERSION, tz_offset_min: -new Date(now).getTimezoneOffset(), local_date: localDate(now) }, rec);
  }
  function touch(rec, now) { rec.updated_at = now || Date.now(); if (rec.sync_state === 'synced') rec.sync_state = 'pending'; return rec; }

  // ---------- миграция данных ----------
  const DEFAULT_PROACTIVE = { max_daily: 2, quiet_from: '23:00', quiet_to: '09:00', followups: true };
  function migrate(D, now) {
    now = now || Date.now();
    D.entries = D.entries || [];
    if (!D.install_id) D.install_id = uuid();
    for (const e of D.entries) {
      if (e.created_at == null) { e.created_at = e.ts; e.updated_at = e.outcomeTs || e.ts; e.deleted_at = null; e.sync_state = 'local'; e.local_date = localDate(e.ts); }
    }
    for (const k of ['sessions', 'offers', 'responses', 'feedback', 'prompts', 'events', 'places_log']) D[k] = D[k] || [];
    D.prefs = D.prefs || {};
    D.profile = D.profile || null;
    D.proactive = Object.assign({}, DEFAULT_PROACTIVE, D.proactive || {});
    D.now = Object.assign({ place: null, place_ts: 0, mode: 'now', shift_date: null, intox_date: null }, D.now || {});
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

  // ---------- пакет ----------
  function indexPack(pack) {
    const byId = {}; for (const s of pack.scenarios) byId[s.id] = s;
    const flows = {}; for (const f of pack.flows || []) { const nodes = {}; for (const n of f.nodes) nodes[n.id] = n; flows[f.id] = Object.assign({}, f, { byNode: nodes }); }
    return Object.assign({}, pack, { byId, flowsById: flows });
  }
  function variantFor(s, ctx) {
    ctx = ctx || {};
    const v = k => (s.variants || []).find(x => x.key === k);
    const def = v('default') || s.variants[0];
    if ((ctx.energy === 1 || ctx.craving >= 7) && v('low_energy')) return v('low_energy');
    const t = ctx.time;
    if (t != null && t < s.duration_min && v('short')) return v('short');
    return def;
  }
  function minDuration(s, variant) { return variant && variant.duration_min != null ? variant.duration_min : s.duration_min; }
  const isHome = p => HOME_PLACES.includes(p);
  const isOut = p => OUT_PLACES.includes(p);

  // Где человек, скорее всего, сейчас (если сам не указал)
  function guessPlace(now, profile) {
    const d = new Date(now); const h = d.getHours() + d.getMinutes() / 60; const wd = d.getDay() >= 1 && d.getDay() <= 5;
    const works = !profile || profile.works_outside !== false;
    if (wd && works && h >= 9.5 && h < 17.5) return 'work';
    if (wd && works && h >= 17.5 && h < 19) return 'road';
    return 'sofa';
  }

  // ---------- статистика по ходам ----------
  function scenarioStats(D, now) {
    now = now || Date.now();
    const st = {};
    const get = id => st[id] || (st[id] = { shown: 0, accepted: 0, planned: 0, declined: 0, skipped: 0, dislike: 0, bored: 0, tried: 0, better: 0, same: 0, worse: 0, better_w: 0, last_shown_at: 0, last_done_at: 0, last_reason: null });
    const offers = {}; for (const o of D.offers) { if (o.deleted_at) continue; offers[o.id] = o; const s = get(o.scenario_id); s.shown++; s.last_shown_at = Math.max(s.last_shown_at, o.shown_at); }
    for (const r of D.responses) {
      const o = offers[r.offer_id]; if (!o || r.deleted_at) continue; const s = get(o.scenario_id);
      if (r.action === 'accepted') s.accepted++;
      if (r.action === 'planned') s.planned++;
      if (r.action === 'skipped') s.skipped++;
      if (r.action === 'declined') { s.declined++; s.last_reason = r.decline_reason; if (r.decline_reason === 'dislike') s.dislike++; if (r.decline_reason === 'bored') s.bored++; }
    }
    for (const f of D.feedback) {
      const o = offers[f.offer_id]; if (!o || f.deleted_at) continue; const s = get(o.scenario_id);
      if (f.tried === 'yes' || f.tried === 'partly') { s.tried++; s.last_done_at = Math.max(s.last_done_at, f.answered_at || 0); }
      if (f.result === 'better') { s.better++; s.better_w += Math.pow(0.85, (now - (f.answered_at || now)) / (7 * DAY)); }
      if (f.result === 'same') s.same++;
      if (f.result === 'worse') s.worse++;
    }
    return st;
  }

  // ---------- равновесие ----------
  // Сделанные за период ходы по сторонам. yes = 1, partly = 0.5. Цель — хотя бы один ход на сторону в день.
  function balance(pack, D, fromTs, toTs) {
    const done = {}; SECTORS.forEach(s => done[s] = 0);
    const moves = [];
    const offers = {}; D.offers.forEach(o => offers[o.id] = o);
    for (const f of D.feedback) {
      if (f.deleted_at || !(f.tried === 'yes' || f.tried === 'partly')) continue;
      const t = f.answered_at || f.created_at; if (t < fromTs || t >= toTs) continue;
      const o = offers[f.offer_id]; const s = o && pack.byId[o.scenario_id]; if (!s || !done.hasOwnProperty(s.sector)) continue;
      const w = f.tried === 'yes' ? 1 : 0.5; done[s.sector] += w; moves.push({ ts: t, scenario_id: s.id, sector: s.sector, w, result: f.result, offer_id: o.id, place: o.context && o.context.place });
    }
    const days = Math.max(1, Math.round((toTs - fromTs) / DAY));
    const fill = {}; SECTORS.forEach(s => fill[s] = Math.min(1, done[s] / days));
    const vals = SECTORS.map(s => fill[s]);
    const evenness = +(vals.reduce((a, b) => a + b, 0) / SECTORS.length).toFixed(3);
    const missing = SECTORS.filter(s => fill[s] === 0);
    const total = SECTORS.reduce((a, s) => a + done[s], 0);
    return { done, fill, evenness, missing, total, moves: moves.sort((a, b) => a.ts - b.ts) };
  }
  function dayBounds(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return [d.getTime(), d.getTime() + DAY]; }
  function todayBalance(pack, D, now) { const [a, b] = dayBounds(now || Date.now()); return balance(pack, D, a, b); }
  // Нагрузка дня 0..10: из чекпоинтов и тяги
  function dayLoad(D, now) {
    const t = localDate(now || Date.now()); const sig = [];
    for (const e of D.entries) {
      if (e.deleted_at || localDate(e.ts) !== t) continue;
      if (e.type === 'checkin' && e.load != null) sig.push(e.load);
      if (e.mood != null) sig.push(10 - e.mood);
      if (e.type === 'craving') sig.push(e.intensity);
    }
    if (!sig.length) return null;
    return Math.round(sig.reduce((a, b) => a + b, 0) / sig.length);
  }

  // ---------- подбор (balance-v1) ----------
  // ctx: {place, mode:'now'|'plan'|'shift', hour, craving, intoxicated, energy, time, can_go_out, want_sectors[], then_ids[], dwell_min, load, fill{}}
  function eligibility(s, ctx, profile, prefs, stats, opts) {
    const p = profile || {};
    const v = variantFor(s, ctx);
    if (s.status !== 'active') return 'inactive';
    const shift = ctx.mode === 'shift';
    if (shift !== (s.sector === 'shift')) return 'mode';
    if ((opts.exclude_ids || []).includes(s.id)) return 'session_shown';
    if (prefs[s.id] && prefs[s.id].blocked) return 'blocked';
    const stt = stats[s.id]; if (stt && stt.dislike >= 2) return 'disliked';
    if (ctx.intoxicated && !s.intoxicated_ok) return 'intoxicated';
    if (ctx.place && !s.places.includes(ctx.place)) return 'place';
    if (ctx.mode === 'plan' && (s.kind === 'transition' || s.places.every(x => x === 'work'))) return 'place';
    if (s.to && isOut(s.to) && isHome(ctx.place) && ctx.can_go_out === false) return 'setting';
    if (s.requires.includes('can_leave_home') && ctx.can_go_out === false) return 'requires';
    if (s.requires.includes('close_person') && p.has_close_person === false) return 'requires';
    if (s.requires.includes('kids') && p.care_duties !== 'kids') return 'requires';
    if (s.requires.includes('balcony') && p.has_balcony === false) return 'requires';
    if (s.hours && ctx.hour != null && !(ctx.hour >= s.hours[0] && ctx.hour < s.hours[1])) return 'hours';
    if (s.days === 'weekend' && ctx.weekday != null && ctx.weekday >= 1 && ctx.weekday <= 5) return 'days';
    if (ctx.time != null && minDuration(s, v) > ctx.time) return 'duration';
    if (!shift && ctx.mode !== 'plan' && ctx.craving >= 7 && (minDuration(s, v) > 20 || s.effort > 2)) return 'craving';
    if (opts.max_effort && s.effort > opts.max_effort) return 'effort';
    const budget = p.budget != null ? p.budget : 1;
    if (s.cost > budget) return 'cost';
    if ((p.dislikes || []).some(t => s.tags.includes(t) || t === s.sector)) return 'dislikes';
    if ((s.excludes_if || []).some(c => (p.constraints || []).includes(c))) return 'constraint';
    if (s.social !== 'solo' && p.social_pref && p.social_pref.length && !p.social_pref.includes(s.social) && !p.social_pref.includes('with_close')) return 'social';
    return null;
  }

  function scoreOne(s, ctx, profile, prefs, stats, now) {
    const p = profile || {}; const st = stats[s.id] || {}; const fill = ctx.fill || {};
    const f = {
      deficit: s.sector in fill ? +(1 - fill[s.sector]).toFixed(2) : 0,
      want: (ctx.want_sectors || []).includes(s.sector) ? 1 : 0,
      chain: (ctx.then_ids || []).includes(s.id) ? 1 : 0,
      transition: s.kind === 'transition' ? 1 : 0, dwell_min: ctx.dwell_min || 0,
      specific: s.places.length <= 2 ? 1 : 0,
      better_w: +(st.better_w || 0).toFixed(3), worse: st.worse || 0, accepted: st.accepted || 0, tried: st.tried || 0,
      shown: st.shown || 0, skipped: st.skipped || 0, bored: st.bored || 0, dislike: st.dislike || 0,
      recent: st.last_shown_at && now - st.last_shown_at < 3 * DAY ? 1 : 0,
      done_today: st.last_done_at && localDate(st.last_done_at) === localDate(now) ? 1 : 0,
      effort: s.effort, novelty: s.novelty, duration_min: s.duration_min, craving: ctx.craving || 0, load: ctx.load == null ? null : ctx.load,
      liked_tag: s.tags.some(t => (p.liked_before || []).includes(t)) ? 1 : 0,
      curious_tag: s.tags.some(t => (p.curious_to_try || []).includes(t)) ? 1 : 0,
      favorite: prefs[s.id] && prefs[s.id].favorite ? 1 : 0,
      hour: ctx.hour != null ? ctx.hour : new Date(now).getHours(), weekday: new Date(now).getDay(),
      place: ctx.place || null, mode: ctx.mode || 'now', intoxicated: !!ctx.intoxicated, sector: s.sector
    };
    let score = 0;
    score += 2.2 * f.deficit;
    score += 2 * f.want + 2 * f.chain;
    score += 0.5 * f.specific;
    if (f.transition) score += f.dwell_min >= 40 ? 1.5 : -0.6;
    score += 2 * f.better_w - 1.5 * f.worse;
    score += 0.4 * Math.min(f.accepted, 4) + 0.4 * Math.min(f.tried, 4);
    score -= 2.5 * f.dislike + 1 * f.bored + 0.3 * Math.min(f.skipped, 5);
    score -= 1.5 * f.recent + 2 * f.done_today;
    if (f.craving >= 5) { if (['quiet', 'body', 'hands'].includes(s.sector)) score += 1; score -= (s.effort - 1) * 0.8; if (s.duration_min > 15) score -= 1; }
    if (f.load != null && f.load >= 7 && ['quiet', 'body'].includes(s.sector)) score += 1;
    if (ctx.energy === 1) score -= (s.effort - 1) * 1.5;
    if (ctx.energy === 3) score += (s.effort - 1) * 0.3;
    if (f.mode === 'plan') { if (s.duration_min >= 15) score += 0.8; if (f.transition) score -= 2; }
    const readiness = p.novelty_readiness || 2;
    if (s.novelty > readiness) score -= (s.novelty - readiness) * 0.8;
    score += f.liked_tag + 0.5 * f.curious_tag + 2 * f.favorite;
    return { score: +score.toFixed(3), features: f };
  }

  function rank(pack, D, ctx, opts) {
    opts = opts || {}; const now = opts.now || Date.now(); const rng = opts.rng || Math.random; const jitter = opts.jitter == null ? 0.6 : opts.jitter;
    const stats = scenarioStats(D, now); const profile = D.profile; const prefs = D.prefs || {};
    const items = []; const excluded = {};
    for (const s of pack.scenarios) {
      const why = eligibility(s, ctx, profile, prefs, stats, opts);
      if (why) { excluded[s.id] = why; continue; }
      const sc = scoreOne(s, ctx, profile, prefs, stats, now);
      const j = +(rng() * jitter).toFixed(3); sc.features.jitter = j;
      items.push({ scenario_id: s.id, scenario_revision: s.revision, variant_key: variantFor(s, ctx).key, category: s.sector, sector: s.sector, score: +(sc.score + j).toFixed(3), features: sc.features });
    }
    items.sort((a, b) => b.score - a.score || a.scenario_id.localeCompare(b.scenario_id));
    return { ranker_id: RANKER_ID, items, excluded };
  }

  // Колода: по очереди лучшие из разных сторон, иногда — исследование нового
  function pick(ranked, count, opts) {
    opts = opts || {}; const rng = opts.rng || Math.random; const rate = opts.exploration == null ? 0.15 : opts.exploration;
    const avoid = new Set(opts.avoid_categories || []);
    let items = ranked.items.slice(); const out = [];
    while (out.length < count && items.length) {
      let chosen = null;
      const recentCats = out.slice(-2).map(o => o.category);
      if (out.length > 0 && rng() < rate) {
        const ex = items.filter(i => (i.features.shown === 0 || i.features.curious_tag) && !recentCats.includes(i.category));
        if (ex.length) { chosen = Object.assign({}, ex[Math.floor(rng() * ex.length)]); chosen.features = Object.assign({}, chosen.features, { explore: 1 }); }
      }
      if (!chosen) {
        const best = items.find(i => !avoid.has(i.category) && !recentCats.includes(i.category)) || items.find(i => !recentCats.includes(i.category)) || items[0];
        chosen = Object.assign({}, best, { features: Object.assign({}, best.features, { explore: 0 }) });
      }
      out.push(chosen); items = items.filter(i => i.scenario_id !== chosen.scenario_id);
    }
    return out;
  }
  function fallbackFor(pack, id) { const s = pack.byId[id]; return s && s.fallback_id ? pack.byId[s.fallback_id] : null; }
  function fill(text, vars) { return String(text || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : ''); }
  function condTrue(cond, ctx, profile) {
    if (!cond) return false;
    return Object.keys(cond).some(k => { const [scope, key] = k.split('.'); const src = scope === 'ctx' ? ctx : (profile || {}); const val = src ? src[key] : undefined; const want = cond[k]; return want === '*' ? val !== undefined && val !== null : val === want; });
  }

  // ---------- проверка пакета (CI) ----------
  function validatePack(pack) {
    const errs = []; const T = pack.taxonomy || {};
    const keys = n => new Set((T[n] || []).map(x => x.key));
    const sectors = keys('sectors'), places = keys('places'), tags = keys('tags'), cons = keys('constraints');
    const reqs = new Set(T.requires || []), actions = new Set(T.actions || []);
    const ids = new Set(); const all = pack.scenarios || [];
    const FORBIDDEN = /(наград|приключени|ещё одн[уа] банк|крепче|новый напиток|коктейл|догнаться|добавить)/i;
    for (const s of all) {
      const at = 'scenario ' + s.id;
      if (!s.id || ids.has(s.id)) errs.push(at + ': пустой или повторный id'); ids.add(s.id);
      for (const f of ['title', 'sector', 'places', 'duration_min', 'duration_max', 'effort', 'cost', 'social', 'novelty', 'variants', 'revision', 'kind'])
        if (s[f] === undefined) errs.push(at + ': нет поля ' + f);
      const shift = s.sector === 'shift';
      if (!shift && !sectors.has(s.sector)) errs.push(at + ': неизвестная сторона ' + s.sector);
      if (!(s.places || []).length) errs.push(at + ': нет мест');
      (s.places || []).forEach(p => places.has(p) || errs.push(at + ': неизвестное место ' + p));
      if (s.to && !places.has(s.to)) errs.push(at + ': неизвестное место перехода ' + s.to);
      if (s.kind === 'transition' && !s.to) errs.push(at + ': переход без to');
      (s.tags || []).forEach(n => tags.has(n) || errs.push(at + ': неизвестный тег ' + n));
      (s.requires || []).forEach(n => reqs.has(n) || errs.push(at + ': неизвестное требование ' + n));
      (s.excludes_if || []).forEach(n => cons.has(n) || errs.push(at + ': неизвестное ограничение ' + n));
      if (s.action && !actions.has(s.action)) errs.push(at + ': неизвестное действие ' + s.action);
      if (s.hours && !(s.hours.length === 2 && s.hours[0] < s.hours[1])) errs.push(at + ': hours');
      if (!['solo', 'with_close', 'among_people'].includes(s.social)) errs.push(at + ': social');
      if (s.duration_min > s.duration_max) errs.push(at + ': duration_min > duration_max');
      if (!(s.variants || []).some(v => v.key === 'default')) errs.push(at + ': нет варианта default');
      (s.variants || []).forEach(v => { if (!['default', 'short', 'low_energy'].includes(v.key) || !v.text) errs.push(at + ': плохой вариант ' + v.key); });
      (s.then || []).forEach(t => all.some(x => x.id === t) || errs.push(at + ': then ' + t + ' не найден'));
      const outdoorOnly = (s.places || []).every(isOut);
      if (!shift) {
        const endsHome = s.to && isHome(s.to);
        if (((outdoorOnly && !endsHome) || (s.to && isOut(s.to))) && s.intoxicated_ok) errs.push(at + ': улица после употребления запрещена');
        if (s.sector === 'body' && s.effort >= 2 && s.intoxicated_ok) errs.push(at + ': нагрузка после употребления запрещена');
        const leaves = (s.places.every(p => p === 'stairs' || p === 'city') && !endsHome) || (s.to && isOut(s.to) && s.places.some(isHome));
        if (leaves && !s.fallback_id) errs.push(at + ': ходу вне дома нужен fallback_id');
      } else {
        (s.variants || []).forEach(v => FORBIDDEN.test(v.text) && errs.push(at + ': запрещённая формулировка'));
        if (s.effort > 1) errs.push(at + ': изменение должно быть лёгким');
      }
    }
    for (const s of all) if (s.fallback_id) {
      const fb = all.find(x => x.id === s.fallback_id);
      if (!fb) errs.push('scenario ' + s.id + ': fallback ' + s.fallback_id + ' не найден');
      else if (!fb.places.some(p => isHome(p) || s.places.includes(p))) errs.push('scenario ' + s.id + ': fallback должен быть доступен дома или там же');
      else if (fb.to && isOut(fb.to)) errs.push('scenario ' + s.id + ': fallback не должен уводить из дома');
    }
    return errs;
  }
  // Покрытие: в каждом месте при скромном контексте должно найтись >= min ходов
  function coverage(pack, D, min) {
    const errs = []; const P = pack.byId ? pack : indexPack(pack);
    const placeKeys = (pack.taxonomy.places || []).map(p => p.key);
    for (const place of placeKeys) for (const ctx of [{ hour: 20, craving: 0 }, { hour: 21, craving: 8 }, { hour: 13, energy: 1 }]) {
      const c = Object.assign({ place, mode: 'now', can_go_out: false, fill: {} }, ctx);
      const n = rank(P, D, c, { rng: () => 0 }).items.length; if (n < min) errs.push(`место ${place} ${JSON.stringify(ctx)}: только ${n} ходов`);
    }
    for (const place of HOME_PLACES) { const n = rank(P, D, { place, mode: 'shift', hour: 21, intoxicated: true }, { rng: () => 0 }).items.length; if (n < 2) errs.push(`изменения в ${place}: только ${n}`); }
    for (const place of HOME_PLACES) { const n = rank(P, D, { place, mode: 'now', hour: 22, intoxicated: true, fill: {} }, { rng: () => 0 }).items.length; if (n < 3) errs.push(`после употребления в ${place}: только ${n}`); }
    return errs;
  }

  const api = { SCHEMA_VERSION, RANKER_ID, SECTORS, HOME_PLACES, OUT_PLACES, uuid, localDate, stamp, touch, migrate, logEvent, indexPack, variantFor,
    guessPlace, isHome, isOut, scenarioStats, balance, dayBounds, todayBalance, dayLoad, eligibility, scoreOne, rank, pick, fallbackFor, fill, condTrue,
    validatePack, coverage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TV = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
