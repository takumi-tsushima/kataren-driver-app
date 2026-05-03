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

// ブランド検出ルール：先頭一致でプレフィックスを剥がし、対応するタグに変換
// 将来的に他社ブランドを追加する際はこの配列に追加するだけ
const BRAND_RULES: { prefix: string; tag: string }[] = [
  { prefix: 'トヨタレンタカー', tag: 'トヨタ' },
  // 例：{ prefix: 'ニッポンレンタカー', tag: 'ニッポン' },
  // 例：{ prefix: 'ニコニコレンタカー', tag: 'ニコニコ' },
]

// 店舗名 → { brand, shortName }
// 例：「トヨタレンタカー練馬駅前店」→ { brand: 'トヨタ', shortName: '練馬駅前店' }
// マッチしない店舗名はそのまま（brand 空文字 / shortName 元の値）
function parseStore(name: string): { brand: string; shortName: string } {
  const t = name.trim()
  for (const rule of BRAND_RULES) {
    if (t.startsWith(rule.prefix)) {
      return { brand: rule.tag, shortName: t.slice(rule.prefix.length) }
    }
  }
  return { brand: '', shortName: t }
}

// 店舗1件の表示：[ブランド] 店舗名（ブランド未検出ならタグ無し）
function formatStoreOne(name: string): string {
  const { brand, shortName } = parseStore(name)
  return brand ? `[${brand}] ${shortName}` : shortName
}

// 区間（出発→到着）の表示
// - 両方同じブランド：先頭にタグ1つだけ → 「[トヨタ] 練馬駅前店 → 成田空港店」
// - 異ブランド or 片方のみブランド：両側に個別タグ
function formatStorePair(pickup: string, dropoff: string): string {
  const p = parseStore(pickup)
  const d = parseStore(dropoff)
  if (p.brand && p.brand === d.brand) {
    return `[${p.brand}] ${p.shortName} → ${d.shortName}`
  }
  const lhs = p.brand ? `[${p.brand}] ${p.shortName}` : p.shortName
  const rhs = d.brand ? `[${d.brand}] ${d.shortName}` : d.shortName
  return `${lhs} → ${rhs}`
}

function routeText(j: Job): string {
  const p = (j.pickup_location ?? '').trim()
  const d = (j.dropoff_location ?? '').trim()
  if (p && d) return formatStorePair(p, d)
  if (p) return formatStoreOne(p)
  if (d) return formatStoreOne(d)
  const legacy = (j.location ?? '').trim()
  return legacy ? formatStoreOne(legacy) : '未設定'
}

// 締切：M/D HH:MM（JST、24時間制、年なし）
function formatDeadline(value: string | null): string {
  if (!value) return '指定なし'
  try {
    const d = new Date(value)
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(d)
    let month = '', day = '', hour = '', minute = ''
    for (const p of parts) {
      if (p.type === 'month') month = p.value
      else if (p.type === 'day') day = p.value
      else if (p.type === 'hour') hour = p.value
      else if (p.type === 'minute') minute = p.value
    }
    return `${month}/${day} ${hour}:${minute}`
  } catch {
    return value
  }
}

// 稼働日：M/D(曜)（JST）
function formatWorkDate(value: string): string {
  try {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) throw new Error('bad date')
    const month = parseInt(m[2], 10)
    const day = parseInt(m[3], 10)
    const dt = new Date(value + 'T00:00:00+09:00')
    const weekday = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      weekday: 'short',
    }).format(dt)
    return `${month}/${day}(${weekday})`
  } catch {
    return value
  }
}

// 1案件分のブロック（区切り線は含まない）
type JobBlock = { areaTag: string | null; lines: string[] }

// 区切り線：18本（仕様）
const SEPARATOR = '━━━━━━━━━━━━━━━━━━'
const FIRST_COME_NOTE = '※先着順のため埋まり次第締切'
const APPLY_PROMPT = '👉 '

// 通知対象ロール：回送ドライバー
// allowed_mentions.roles で限定し、@everyone やそれ以外のロールには配信しない
const DRIVER_ROLE_ID = '1500072642626191440'
const NOTIFY_HEADER = '🔔新着案件のお知らせ🔔'

// 店舗名から都市を推定（往復タイトル「東京⇄成田」用）
function cityFromStore(name: string | null | undefined): string {
  if (!name) return ''
  if (name.includes('成田')) return '成田'
  if (name.includes('名古屋')) return '名古屋'
  return '東京' // 既存7店舗の残りはすべて東京エリア
}

function roundTripTitle(out: Job, ret: Job): string {
  const a = cityFromStore(out.pickup_location)
  const b = cityFromStore(out.dropoff_location)
  if (a && b && a !== b) return `往復（${a}⇄${b}）`
  if (a) return `往復（${a}）`
  if (b) return `往復（${b}）`
  return '往復'
}

function buildSingleBlock(j: Job): JobBlock {
  const tag = j.area_tag ? (AREA_TAG_LABEL[j.area_tag] ?? j.area_tag) : '—'
  const lines = [
    `【${tag}】`,
    '',
    formatWorkDate(j.work_date),
    routeText(j),
    '',
    `募集：${j.capacity ?? 1}名`,
    `締切：${formatDeadline(j.application_deadline)}`,
    FIRST_COME_NOTE,
  ]
  if (j.note && j.note.trim()) lines.push(`備考：${j.note.trim()}`)
  lines.push('', `${APPLY_PROMPT}${APP_URL}`)
  return { areaTag: j.area_tag, lines }
}

function buildRoundTripBlock(legs: Job[]): JobBlock {
  // legs[0] を往路、legs[1] を復路とする（id 昇順で安定化）
  const sorted = [...legs].sort((a, b) => a.id.localeCompare(b.id))
  const out = sorted[0]
  const ret = sorted[1]
  const capacity = out.capacity ?? ret.capacity ?? 1
  const deadlineOut = formatDeadline(out.application_deadline)
  const deadlineRet = formatDeadline(ret.application_deadline)
  const deadlineLine = deadlineOut === deadlineRet
    ? `締切：${deadlineOut}`
    : `締切：往路 ${deadlineOut} ／ 復路 ${deadlineRet}`
  const lines = [
    `【${roundTripTitle(out, ret)}】`,
    '',
    formatWorkDate(out.work_date),
    `①${routeText(out)}`,
    `②${routeText(ret)}`,
    '',
    `募集：${capacity}名(往復セット)`,
    deadlineLine,
    FIRST_COME_NOTE,
  ]
  const notes: string[] = []
  if (out.note && out.note.trim()) notes.push(`往路 ${out.note.trim()}`)
  if (ret.note && ret.note.trim()) notes.push(`復路 ${ret.note.trim()}`)
  if (notes.length > 0) lines.push(`備考：${notes.join(' / ')}`)
  lines.push('', `${APPLY_PROMPT}${APP_URL}`)
  return { areaTag: 'round_trip', lines }
}

// 1チャンネルへの1メッセージ全体を組み立てる
// 冒頭に回送ドライバーロールのメンション + 「新着案件のお知らせ」を1度だけ。
// 各ブロックは自己完結（応募リンク含む）。隣接ブロック間の区切り線は1本で兼用。
function renderMessage(blocks: JobBlock[]): string {
  const out: string[] = []
  out.push(`<@&${DRIVER_ROLE_ID}>`)
  out.push(NOTIFY_HEADER)
  out.push('')
  out.push(SEPARATOR)
  for (const b of blocks) {
    for (const line of b.lines) out.push(line)
    out.push(SEPARATOR)
  }
  return out.join('\n')
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

  // 3) 案件ブロックを組み立て（往復は1ブロック、単独・不整合は片道として）
  const blocks: JobBlock[] = []
  for (const j of singles) {
    blocks.push(buildSingleBlock(j))
  }
  for (const [, legs] of groups) {
    if (legs.length === 2) {
      blocks.push(buildRoundTripBlock(legs))
    } else {
      // 不整合：片道として個別ブロック
      for (const j of legs) blocks.push(buildSingleBlock(j))
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

  // 5) チャンネル毎にブロックを集約：area_tag のチャンネル + 'all'
  const channelBlocks = new Map<string, JobBlock[]>()
  for (const block of blocks) {
    if (block.areaTag && channelMap.has(block.areaTag)) {
      const arr = channelBlocks.get(block.areaTag) ?? []
      arr.push(block)
      channelBlocks.set(block.areaTag, arr)
    }
    if (channelMap.has('all')) {
      const arr = channelBlocks.get('all') ?? []
      arr.push(block)
      channelBlocks.set('all', arr)
    }
  }

  // 6) チャンネル毎に1メッセージへまとめて並列配信
  const sends: Promise<{ ok: boolean; channel: string; status?: number; error?: string }>[] = []
  for (const [areaTag, channelBlockList] of channelBlocks) {
    const url = channelMap.get(areaTag)!
    const content = renderMessage(channelBlockList)
    sends.push(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          // 回送ドライバーロールのみメンション許可。@everyone / @here / 他ロール / ユーザー指定は全て無効。
          allowed_mentions: {
            parse: [],
            roles: [DRIVER_ROLE_ID],
          },
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            return { ok: false, channel: areaTag, status: res.status, error: text.slice(0, 200) }
          }
          return { ok: true, channel: areaTag, status: res.status }
        })
        .catch((e) => ({ ok: false, channel: areaTag, error: String(e).slice(0, 200) }))
    )
  }

  const results = await Promise.all(sends)
  const sent = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) console.warn('Discord deliveries failed', failed)

  return jsonResponse({
    ok: true,
    blocks: blocks.length,
    channels: channelBlocks.size,
    attempted: results.length,
    sent,
    failed: failed.length,
  })
})
