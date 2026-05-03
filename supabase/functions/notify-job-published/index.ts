// Discord通知 Edge Function
// - 入力：{ job_ids: string[] }
// - 動作：jobsを取得→group_idで集約→discord_channelsから webhook URL 取得→Discord POST
// - 失敗：握りつぶす（呼び出し元の公開フローを止めない）
// - 認証：verify_jwt=true（authenticated ユーザーからのみ呼べる）
// - CORS：localhost / 本番Vercel から呼べるように preflight 対応

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// CORS共通ヘッダー
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

// 本番アプリURL（通知本文のリンク先）。将来は env var 化を検討
const APP_URL = 'https://kataren-driver-app.vercel.app/'

type Job = {
  id: string
  work_date: string
  capacity: number | null
  application_deadline: string | null
  note: string | null
  status: string
  area_tag: string | null
  group_id: string | null
  pickup_location: string | null
  dropoff_location: string | null
  location: string | null
}

type DiscordChannel = {
  area_tag: string
  webhook_url: string
}

const AREA_TAG_LABEL: Record<string, string> = {
  round_trip: '往復',
  tokyo_to_narita: '東京→成田',
  narita_to_tokyo: '成田→東京',
  tokyo_to_nagoya: '東京→名古屋',
  nagoya_to_tokyo: '名古屋→東京',
}

function routeText(j: Job): string {
  const p = (j.pickup_location ?? '').trim()
  const d = (j.dropoff_location ?? '').trim()
  if (p && d) return `${p} → ${d}`
  if (p) return p
  if (d) return d
  return j.location ?? '未設定'
}

function formatDeadline(value: string | null): string {
  if (!value) return '指定なし'
  try {
    const d = new Date(value)
    const fmt = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
    return fmt.format(d)
  } catch {
    return value
  }
}

function formatWorkDate(value: string): string {
  try {
    const d = new Date(value + 'T00:00:00+09:00')
    const fmt = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    })
    return fmt.format(d)
  } catch {
    return value
  }
}

function formatSingle(j: Job): string {
  const tag = j.area_tag ? (AREA_TAG_LABEL[j.area_tag] ?? j.area_tag) : '—'
  const lines = [
    '🆕 新規案件が公開されました',
    '',
    `📅 ${formatWorkDate(j.work_date)}`,
    `📍 ${routeText(j)}`,
    `🏷 ${tag}`,
    `👥 募集: ${j.capacity ?? 1}名`,
    `⏰ 締切: ${formatDeadline(j.application_deadline)}`,
  ]
  if (j.note && j.note.trim()) lines.push(`📝 備考: ${j.note.trim()}`)
  lines.push('', `応募はアプリから: ${APP_URL}`)
  return lines.join('\n')
}

function formatRoundTrip(legs: Job[]): string {
  // legs[0] を往路、legs[1] を復路とする（id 昇順で安定化）
  const sorted = [...legs].sort((a, b) => a.id.localeCompare(b.id))
  const out = sorted[0]
  const ret = sorted[1]
  const capacity = out.capacity ?? ret.capacity ?? 1
  const deadlineOut = formatDeadline(out.application_deadline)
  const deadlineRet = formatDeadline(ret.application_deadline)
  const deadlineLine = deadlineOut === deadlineRet
    ? `⏰ 締切: ${deadlineOut}`
    : `⏰ 締切: 往路 ${deadlineOut} ／ 復路 ${deadlineRet}`
  const lines = [
    '🔁 新規 往復案件が公開されました',
    '',
    `📅 ${formatWorkDate(out.work_date)}`,
    `① 往路: ${routeText(out)}`,
    `② 復路: ${routeText(ret)}`,
    `👥 募集: ${capacity}名(往復セット)`,
    deadlineLine,
  ]
  const notes: string[] = []
  if (out.note && out.note.trim()) notes.push(`往路: ${out.note.trim()}`)
  if (ret.note && ret.note.trim()) notes.push(`復路: ${ret.note.trim()}`)
  if (notes.length > 0) lines.push(`📝 備考: ${notes.join(' / ')}`)
  lines.push('', `応募はアプリから: ${APP_URL}`)
  return lines.join('\n')
}

Deno.serve(async (req) => {
  // CORS preflight：認証もJSONも要らずに即返す
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 })
  }

  let body: { job_ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, code: 'BAD_JSON' }, { status: 400 })
  }

  const jobIds = (body.job_ids ?? []).filter((s) => typeof s === 'string')
  if (jobIds.length === 0) {
    return jsonResponse({ ok: true, sent: 0, note: 'no job_ids' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return jsonResponse({ ok: false, code: 'SERVER_MISCONFIGURED' }, { status: 500 })
  }

  const sb = createClient(supabaseUrl, serviceKey)

  // 1) jobs取得
  const { data: jobsData, error: jobsErr } = await sb
    .from('jobs')
    .select('id, work_date, capacity, application_deadline, note, status, area_tag, group_id, pickup_location, dropoff_location, location')
    .in('id', jobIds)

  if (jobsErr) {
    console.error('jobs fetch failed', jobsErr)
    return jsonResponse(
      { ok: false, code: 'JOBS_FETCH_FAILED', message: jobsErr.message },
      { status: 500 }
    )
  }

  const jobs = (jobsData ?? []) as Job[]
  if (jobs.length === 0) {
    return jsonResponse({ ok: true, sent: 0, note: 'no jobs found' })
  }

  // 2) group_idで集約
  const groups = new Map<string, Job[]>()
  const singles: Job[] = []
  for (const j of jobs) {
    if (j.group_id) {
      const arr = groups.get(j.group_id) ?? []
      arr.push(j)
      groups.set(j.group_id, arr)
    } else {
      singles.push(j)
    }
  }

  // 3) 通知メッセージ単位を組み立て（往復は1件、単独・不整合は片道として）
  const messages: { areaTag: string | null; content: string }[] = []
  for (const j of singles) {
    messages.push({ areaTag: j.area_tag, content: formatSingle(j) })
  }
  for (const [, legs] of groups) {
    if (legs.length === 2) {
      messages.push({ areaTag: 'round_trip', content: formatRoundTrip(legs) })
    } else {
      // 不整合：片道として個別通知
      for (const j of legs) {
        messages.push({ areaTag: j.area_tag, content: formatSingle(j) })
      }
    }
  }

  // 4) discord_channels取得
  const { data: channelsData, error: chErr } = await sb
    .from('discord_channels')
    .select('area_tag, webhook_url')
    .eq('is_active', true)

  if (chErr) {
    console.error('discord_channels fetch failed', chErr)
    return jsonResponse(
      { ok: false, code: 'CHANNELS_FETCH_FAILED', message: chErr.message },
      { status: 500 }
    )
  }

  const channels = (channelsData ?? []) as DiscordChannel[]
  const channelMap = new Map<string, string>()
  for (const c of channels) channelMap.set(c.area_tag, c.webhook_url)

  // 5) 各メッセージを target channels（area_tag + 'all'）へ並列配信
  const sends: Promise<{ ok: boolean; channel: string; status?: number; error?: string }>[] = []
  for (const m of messages) {
    const targets = new Set<string>()
    if (m.areaTag && channelMap.has(m.areaTag)) targets.add(m.areaTag)
    if (channelMap.has('all')) targets.add('all')
    for (const t of targets) {
      const url = channelMap.get(t)!
      sends.push(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: m.content }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const text = await res.text().catch(() => '')
              return { ok: false, channel: t, status: res.status, error: text.slice(0, 200) }
            }
            return { ok: true, channel: t, status: res.status }
          })
          .catch((e) => ({ ok: false, channel: t, error: String(e).slice(0, 200) }))
      )
    }
  }

  const results = await Promise.all(sends)
  const sent = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) console.warn('Discord deliveries failed', failed)

  return jsonResponse({
    ok: true,
    messages: messages.length,
    attempted: results.length,
    sent,
    failed: failed.length,
  })
})
