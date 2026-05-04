// 請求書申請通知（運営専用 Discord チャンネル）
// - フロント（DriverInvoiceCreate）から generate_invoice 成功直後に invoke される
// - DISCORD_INVOICE_WEBHOOK_URL（Supabase Secrets）に POST する
// - 失敗してもフロント側に伝播させない（常に 200 を返す）
// - メンションは無効化（allowed_mentions: { parse: [] }）
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APP_URL = 'https://kataren-driver-app.vercel.app/'
const SEPARATOR = '━'.repeat(18)

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const formatJpyAmount = (amount: number | null | undefined): string => {
  if (amount == null) return '¥0'
  return `¥${amount.toLocaleString('ja-JP')}`
}

const formatJstDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '不明'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // UTC ベースに +9h を加算してフォーマット
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const yyyy = jst.getUTCFullYear()
  const mm = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(jst.getUTCDate()).padStart(2, '0')
  const HH = String(jst.getUTCHours()).padStart(2, '0')
  const MM = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${HH}:${MM}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const invoiceId = body?.invoice_id as string | undefined
    if (!invoiceId) {
      console.warn('invoice_id is missing in request body')
      return jsonResponse(200, { ok: false, reason: 'invoice_id_missing' })
    }

    const webhookUrl = Deno.env.get('DISCORD_INVOICE_WEBHOOK_URL')
    if (!webhookUrl) {
      console.warn('DISCORD_INVOICE_WEBHOOK_URL is not configured')
      return jsonResponse(200, { ok: false, reason: 'webhook_not_configured' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      console.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not configured')
      return jsonResponse(200, { ok: false, reason: 'supabase_env_missing' })
    }

    // invoice 取得
    const invoiceRes = await fetch(
      `${supabaseUrl}/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}&select=*`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    if (!invoiceRes.ok) {
      const text = await invoiceRes.text()
      console.warn('Failed to fetch invoice:', invoiceRes.status, text)
      return jsonResponse(200, { ok: false, reason: 'invoice_fetch_failed' })
    }
    const invoices = await invoiceRes.json()
    const invoice = Array.isArray(invoices) ? invoices[0] : null
    if (!invoice) {
      console.warn('invoice not found:', invoiceId)
      return jsonResponse(200, { ok: false, reason: 'invoice_not_found' })
    }

    // 対象案件数（invoice_items の COUNT）
    const itemsRes = await fetch(
      `${supabaseUrl}/rest/v1/invoice_items?invoice_id=eq.${encodeURIComponent(invoiceId)}&select=id`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    let itemCount = 0
    if (itemsRes.ok) {
      const items = await itemsRes.json()
      if (Array.isArray(items)) itemCount = items.length
    } else {
      console.warn('Failed to fetch invoice_items count:', itemsRes.status)
    }

    // メッセージ組み立て
    const driverName = invoice.driver_name_snapshot ?? '(名前未登録)'
    const billingMonth = `${invoice.billing_year}年${invoice.billing_month}月分`
    const amount = formatJpyAmount(invoice.total_jpy)
    const issuedAtJst = formatJstDateTime(invoice.issued_at)

    const content = [
      SEPARATOR,
      '💰 請求書申請がありました',
      '',
      `申請者:${driverName}`,
      `対象月:${billingMonth}`,
      `請求金額:${amount}`,
      `対象案件数:${itemCount}件`,
      `請求書番号:${invoice.invoice_number}`,
      `申請日時:${issuedAtJst}`,
      '',
      '📋 管理画面の「請求書管理」から内容を確認してください',
      `👉 ${APP_URL}`,
      SEPARATOR,
    ].join('\n')

    // Discord webhook へ POST（メンションは無効化）
    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
      }),
    })

    if (!discordRes.ok) {
      const text = await discordRes.text()
      console.warn('Discord webhook failed:', discordRes.status, text)
      return jsonResponse(200, {
        ok: false,
        reason: 'discord_webhook_failed',
        status: discordRes.status,
      })
    }

    return jsonResponse(200, { ok: true })
  } catch (e) {
    console.warn('notify-invoice-submitted error:', e instanceof Error ? e.message : e)
    return jsonResponse(200, { ok: false, reason: 'internal_error' })
  }
})
