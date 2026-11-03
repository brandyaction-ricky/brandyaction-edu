import { kstDay, type ExportDataset } from './edu-export-contract';
import { exportedAdControl, type AdEvidence } from './edu-ad-controls';

type Row = Record<string, unknown>;
export type ExportSource = Record<string, Row[] | Row | boolean>;
const str = (row: Row, key: string) => typeof row[key] === 'string' ? row[key] as string : '';
const num = (row: Row, key: string) => typeof row[key] === 'number' ? row[key] as number : 0;
const stamp = (row: Row, key: string) => str(row, key) ? Date.parse(str(row, key)) : NaN;
const sources = ['paid', 'organic', 'alumni', 'youtube', 'unknown'] as const;
type Funnel = Record<string, number | null>;
type Total = {
  date_kst: string; cohort_code: string | null; orders: number; new_buyers: number;
  net_vat_incl_total: number; net_vat_incl_by_src: Record<typeof sources[number], number>;
  refund_reserve_krw: number | null; funnel: Funnel;
  consent_pool: Record<string, number | null>; matured: boolean;
};

/** All private identifiers stay inside this pure aggregator. Construct output fields explicitly. */
export function aggregateExport(dataset: ExportDataset, source: ExportSource, days: string[], now: Date) {
  const rows = (name: string): Row[] => {
    if (!Array.isArray(source[name])) throw Error('EXPORT_SOURCE_MISSING');
    return source[name] as Row[];
  };
  const settings = source.settings as Row;
  if (!settings || Array.isArray(settings)) throw Error('EXPORT_SOURCE_MISSING');
  const asof = now.getTime(), today = kstDay(now), daySet = new Set(days);
  const dayOf = (row: Row, key: string) => kstDay(str(row, key));
  const cutoff = (day: string) => Math.min(asof, Date.parse(day + 'T00:00:00+09:00') + 86400_000 - 1);
  const oldDay = (day: string) => Date.parse(today) - Date.parse(day) >= 8 * 86400_000;
  const cohorts = new Map(rows('cohorts').map(row => [str(row, 'id'), row]));
  const code = (id: string): string | null => {
    const row = cohorts.get(id);
    return row && str(row, 'course_code') && str(row, 'cohort_code') ? str(row, 'course_code') + ':' + str(row, 'cohort_code') : null;
  };
  const matured = (day: string, id: string | null) => id === null ? oldDay(day) :
    Number.isFinite(stamp(cohorts.get(id) || {}, 'operation_end_at')) &&
    asof >= stamp(cohorts.get(id)!, 'operation_end_at') + 7 * 86400_000;
  const usageSince = str(settings, 'learningUsageSince');
  const measuredUsage = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(usageSince) && day >= usageSince;
  const productSince = str(settings, 'productTrackingSince');
  const measuredProducts = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(productSince) && day >= productSince;
  const totals = new Map<string, Total>();
  const total = (day: string, id: string | null): Total => {
    const cohort = id ? code(id) : null, key = day + '|' + cohort;
    if (!totals.has(key)) totals.set(key, {
      date_kst: day, cohort_code: cohort, orders: 0, new_buyers: 0, net_vat_incl_total: 0,
      net_vat_incl_by_src: { paid: 0, organic: 0, alumni: 0, youtube: 0, unknown: 0 },
      refund_reserve_krw: cohort && !matured(day, id) ? null : 0,
      funnel: { landing_viewed: 0, chat_clicked: 0, chat_joined_manual: null, class_registered: 0,
        live_entered: 0, practice_submitted: null, product_viewed: measuredProducts(day) ? 0 : null,
        checkout_started: 0, payment_completed: 0, lesson_started: measuredUsage(day) ? 0 : null,
        week1_active: measuredUsage(day) ? 0 : null, usage_50: measuredUsage(day) ? 0 : null },
      consent_pool: { marketing_sms: null, marketing_email: null, marketing_kakao: null },
      matured: matured(day, cohort ? id : null),
    });
    return totals.get(key)!;
  };
  days.forEach(day => total(day, null));
  const add = (day: string, id: string | null, field: string, n = 1) => {
    if (!daySet.has(day)) return;
    const funnel = total(day, id).funnel;
    if (funnel[field] !== null) funnel[field] += n;
  };
  const items = rows('items');
  const orderCohort = (orderId: string) => {
    const ids = [...new Set(items.filter(item => str(item, 'order_id') === orderId).map(item => str(item, 'cohort_id')))];
    // The existing checkout sells one cohort. Fail closed for an ambiguous future bundle.
    if (ids.length !== 1 || !code(ids[0])) throw Error('EXPORT_ORDER_COHORT');
    return ids[0];
  };
  const campaignRows: Row[] = [];
  const campaign = (day: string, id: string): Row => {
    const cohort = code(id);
    if (!cohort) throw Error('EXPORT_ORDER_COHORT');
    let row = campaignRows.find(r => r.date_kst === day && r.cohort_code === cohort && r.revenue_grain === 'cohort');
    if (!row) {
      row = { date_kst: day, platform: 'meta', campaign_id: null, adset_id: null, ad_id: null,
        campaign_kind: null, cohort_code: cohort, landings: null, chat_clicks: 0, registrations: 0,
        orders: 0, new_buyers: 0, gross_vat_incl: 0, refunds: 0, net_vat_incl: 0,
        revenue_grain: 'cohort', attribution_def: 'path_cohort@1', matured: matured(day, id) };
      campaignRows.push(row);
    }
    return row;
  };
  const payments = rows('payments'), refunds = rows('refunds');
  for (const order of rows('orders')) {
    const id = orderCohort(str(order, 'id')), created = dayOf(order, 'created_at');
    add(created, id, 'checkout_started');
    if (!str(order, 'paid_at') || stamp(order, 'paid_at') > asof || !['paid', 'partially_refunded', 'refunded'].includes(str(order, 'status'))) continue;
    const day = dayOf(order, 'paid_at');
    if (!daySet.has(day)) continue;
    const t = total(day, id), pp = payments.filter(p => str(p, 'order_id') === str(order, 'id'));
    const gross = pp.reduce((n, p) => n + num(p, 'approved_amount'), 0);
    const rr = refunds.filter(r => pp.some(p => str(p, 'id') === str(r, 'payment_id')));
    const refunded = rr.reduce((n, r) => n + num(r, 'amount'), 0), net = gross - refunded;
    // Both ledgers are updated atomically. Never export a silently inconsistent financial snapshot.
    if (pp.reduce((n, p) => n + num(p, 'cancelled_amount'), 0) !== refunded) throw Error('EXPORT_LEDGER_MISMATCH');
    const first = str(order, 'first_paid_order_id') === str(order, 'id') ? 1 : 0;
    const src = sources.find(s => s === str(order, 'entry_src')) || 'unknown';
    t.orders++; t.new_buyers += first; t.net_vat_incl_total += net; t.net_vat_incl_by_src[src] += net;
    t.funnel.payment_completed = (t.funnel.payment_completed || 0) + 1;
    if (src === 'paid') {
      const c = campaign(day, id);
      for (const [key, value] of Object.entries({ orders: 1, new_buyers: first, gross_vat_incl: gross, refunds: refunded, net_vat_incl: net }))
        c[key] = num(c, key) + value;
    }
  }
  const campaigns = rows('campaigns');
  const mapLanding = (event: Row, day: string) => {
    const candidates = campaigns.filter(c => str(c, 'landing_id') === str(event, 'landing_id') &&
      (str(event, 'utm_campaign') ? str(c, 'utm_campaign') === str(event, 'utm_campaign') :
        str(c, 'start_day') <= day && str(c, 'end_day') >= day));
    return candidates.length === 1 ? candidates[0] : null;
  };
  // Layout revisions and repeated events never count one session twice on the same day.
  const sessions = new Map<string, Row[]>();
  for (const event of rows('funnel')) {
    const key = dayOf(event, 'created_at') + '|' + str(event, 'landing_id') + '|' + str(event, 'session_id');
    sessions.set(key, [...(sessions.get(key) || []), event]);
  }
  for (const events of sessions.values()) {
    events.sort((a, b) => stamp(a, 'created_at') - stamp(b, 'created_at'));
    const event = events[0], day = dayOf(event, 'created_at'), c = mapLanding(event, day);
    const id = c ? str(c, 'paid_cohort_id') || null : null;
    const viewed = events.some(e => e.event_type === 'view_page') ? 1 : 0;
    const clicked = events.some(e => e.event_type === 'click_cta') ? 1 : 0;
    add(day, id, 'landing_viewed', viewed); add(day, id, 'chat_clicked', clicked);
    const d = c ? rows('dimensions').find(d => str(d, 'campaign_id') === str(c, 'id') &&
      str(d, 'adset_key') === str(event, 'utm_term') && str(d, 'creative_key') === str(event, 'utm_content')) : null;
    if (!c || c.uses_ads !== true || (!d && str(event, 'utm_campaign') !== str(c, 'utm_campaign'))) continue;
    const ad = d ? str(d, 'meta_ad_id') || null : null;
    const meta = rows('meta').find(m => str(m, 'campaign_id') === str(c, 'id') && m.day === day && m.meta_ad_id === ad);
    const ids = { campaign_id: meta ? str(meta, 'meta_campaign_id') || null : null,
      adset_id: d ? str(d, 'meta_adset_id') || null : null, ad_id: ad };
    let r = campaignRows.find(r => r.revenue_grain === 'ad' && r.date_kst === day && r.cohort_code === code(id || '') &&
      r.campaign_id === ids.campaign_id && r.adset_id === ids.adset_id && r.ad_id === ids.ad_id);
    if (!r) {
      r = { date_kst: day, platform: 'meta', ...ids, campaign_kind: d ? str(d, 'ad_type') : 'unclassified',
        cohort_code: code(id || ''), landings: 0, chat_clicks: 0, registrations: null, orders: null,
        new_buyers: null, gross_vat_incl: null, refunds: null, net_vat_incl: null,
        revenue_grain: 'ad', attribution_def: 'path_cohort@1', matured: oldDay(day) };
      campaignRows.push(r);
    }
    r.landings = num(r, 'landings') + viewed; r.chat_clicks = num(r, 'chat_clicks') + clicked;
  }
  for (const [name, field, time] of [['clicks', 'chat_clicked', 'created_at'], ['registrations', 'class_registered', 'registered_at'], ['broadcasts', 'live_entered', 'created_at']]) {
    for (const row of rows(name)) {
      const day = dayOf(row, time), id = str(row, 'paid_cohort_id') || null;
      add(day, id, field);
      if (daySet.has(day) && id && code(id) && row.channel === 'paid' && name !== 'broadcasts') {
        const c = campaign(day, id), key = name === 'clicks' ? 'chat_clicks' : 'registrations';
        c[key] = num(c, key) + 1;
      }
    }
  }
  for (const c of campaigns.filter(c => c.uses_ads === true)) {
    const actuals = rows('actuals').filter(r => r.campaign_id === c.id).sort((a, b) => str(a, 'day').localeCompare(str(b, 'day')));
    actuals.forEach((a, i) => {
      const day = str(a, 'day');
      // The first cumulative snapshot has no measured baseline, so it is not a daily join count.
      if (!daySet.has(day) || i === 0) return;
      const t = total(day, str(c, 'paid_cohort_id') || null);
      // A drop in cumulative room members records exits, not negative new joins.
      t.funnel.chat_joined_manual = (t.funnel.chat_joined_manual || 0) + Math.max(0, num(a, 'kakao_members') - num(actuals[i - 1], 'kakao_members'));
    });
  }
  const productSessions = new Set<string>();
  for (const p of rows('products')) {
    const day = dayOf(p, 'occurred_at');
    if (!measuredProducts(day)) continue;
    const candidates = [...cohorts.values()].filter(c => str(p, 'path') === '/classes/' + str(c, 'slug') &&
      stamp(c, 'recruitment_start_at') <= stamp(p, 'occurred_at') && stamp(c, 'recruitment_end_at') >= stamp(p, 'occurred_at'));
    const id = candidates.length === 1 ? str(candidates[0], 'id') : null;
    const key = day + '|' + str(p, 'session_id'); if (productSessions.has(key)) continue;
    productSessions.add(key); add(day, id, 'product_viewed');
  }
  const enrollments = rows('enrollments'), usage = rows('usage'), catalog = rows('catalog');
  const usedItems = (e: Row, end: number) => {
    const configured = new Set(catalog.filter(c => c.enrollment_id === e.id).map(c => c.item_type + ':' + c.item_id));
    const events = usage.filter(u => u.enrollment_id === e.id && stamp(u, 'first_used_at') <= end &&
      configured.has(u.item_type + ':' + u.item_id)).sort((a, b) => stamp(a, 'first_used_at') - stamp(b, 'first_used_at'));
    const distinct = [...new Map(events.map(u => [u.item_type + ':' + u.item_id, u])).values()];
    return { total: configured.size, events: distinct, half: configured.size ? distinct.length * 2 >= configured.size : null };
  };
  for (const e of enrollments) {
    const all = usage.filter(u => u.enrollment_id === e.id).sort((a, b) => stamp(a, 'first_used_at') - stamp(b, 'first_used_at'));
    const id = str(e, 'cohort_id');
    if (all.length) add(dayOf(all[0], 'first_used_at'), id, 'lesson_started');
    const start = Math.max(stamp(cohorts.get(id) || {}, 'operation_start_at') || 0, stamp(e, 'access_starts_at') || 0);
    const end = Math.min(start + 7 * 86400_000, stamp(e, 'revoked_at') || Infinity, stamp(e, 'access_ends_at') || Infinity);
    const u = all.find(u => stamp(u, 'first_used_at') >= start && stamp(u, 'first_used_at') < end);
    const visits = rows('visits').filter(v => v.user_id === e.user_id && stamp(v, 'first_seen_at') >= start && stamp(v, 'first_seen_at') < end)
      .sort((a, b) => stamp(a, 'first_seen_at') - stamp(b, 'first_seen_at'));
    if (u && visits.length) add(kstDay(Math.max(stamp(u, 'first_used_at'), stamp(visits[0], 'first_seen_at'))), id, 'week1_active');
    const configured = usedItems(e, asof);
    if (configured.half) add(dayOf(configured.events[Math.ceil(configured.total / 2) - 1], 'first_used_at'), id, 'usage_50');
  }
  for (const day of days) {
    const t = total(day, null);
    if (day < '2026-10-20' || source.consentEnabled !== true) continue;
    const choices = new Map<string, Map<string, string>>();
    for (const c of rows('consent').filter(c => stamp(c, 'occurred_at') <= cutoff(day)).sort((a, b) => stamp(a, 'occurred_at') - stamp(b, 'occurred_at'))) {
      const id = str(c, 'member_id'), entry = choices.get(id) || new Map<string, string>();
      entry.set(str(c, 'kind'), str(c, 'action')); choices.set(id, entry);
    }
    t.consent_pool = { marketing_sms: 0, marketing_email: 0, marketing_kakao: 0 };
    for (const c of choices.values()) if (c.get('marketingUse') === 'consent')
      for (const channel of ['sms', 'email', 'kakao']) if (c.get(channel) === 'consent') t.consent_pool['marketing_' + channel]!++;
  }
  const totalRows = [...totals.values()].filter(t => t.cohort_code === null || t.orders > 0 ||
    Object.values(t.funnel).some(value => value !== null && value > 0));
  const ops = days.map(day => {
    const end = cutoff(day);
    const active = enrollments.filter(e => (stamp(e, 'access_starts_at') || -Infinity) <= end &&
      (stamp(e, 'access_ends_at') || Infinity) > end && (stamp(e, 'revoked_at') || Infinity) > end && stamp(e, 'created_at') <= end);
    const done = refunds.filter(r => dayOf(r, 'completed_at') === day);
    const crm = rows('crm').filter(r => dayOf(r, 'sent_at') === day);
    return { date_kst: day, paid_orders_n: totalRows.filter(t => t.date_kst === day).reduce((n, t) => n + t.orders, 0),
      refund_requests_n: rows('refund_requests').filter(r => dayOf(r, 'created_at') === day).length,
      refunds_done_n: done.length, refund_amount: done.reduce((n, r) => n + num(r, 'amount'), 0),
      active_learners_n: active.length, usage_below_50_n: measuredUsage(day) ? active.filter(e => usedItems(e, end).half === false).length : null,
      question_backlog_n: rows('questions').filter(q => stamp(q, 'created_at') <= end &&
        (!str(q, 'archived_at') || stamp(q, 'archived_at') > end) &&
        !(Array.isArray(q.answer_times) && (q.answer_times as Row[]).some(a => stamp(a, 'created_at') <= end &&
          (!str(a, 'deleted_at') || stamp(a, 'deleted_at') > end)))).length,
      crm_info_n: crm.filter(r => ['sms', 'lms', 'alimtalk'].includes(str(r, 'channel')) && r.purpose === 'transactional').length,
      crm_ad_n: crm.filter(r => ['sms', 'lms', 'alimtalk'].includes(str(r, 'channel')) && r.purpose === 'marketing').length,
      mail_n: crm.filter(r => r.channel === 'email').length,
      push_n: rows('push').filter(r => dayOf(r, 'finished_at') === day).length,
      controls: Array.isArray(source.ad_controls) ? exportedAdControl(source.ad_controls as unknown as AdEvidence[], day, now) : null,
      matured: oldDay(day) };
  });
  return { tenant: 'brandyaction_edu', contract_version: '1.0', metric_version: 'edu_web@1',
    generated_at: now.toISOString(), rows: dataset === 'daily_totals' ? totalRows : dataset === 'ops_daily' ? ops :
      campaignRows.filter(r => ['landings', 'chat_clicks', 'registrations', 'orders'].some(k => num(r, k) > 0)) };
}
