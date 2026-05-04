import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  Send,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Repeat,
  Info,
  Loader2,
} from 'lucide-react'
import { subMonths } from 'date-fns'
import { supabase } from '../lib/supabase'
import {
  formatJPY,
  formatJPYWithSymbol,
  formatDateLong,
} from '../lib/invoiceFormat'
import { extractBrandFromPair } from '../lib/brand'

type PreviewItem = {
  application_id: string
  job_id: string
  work_date: string
  pickup: string | null
  dropoff: string | null
  area_tag: string | null
  round_trip_role: 'outbound' | 'return' | null
  fee_per_driver: number | null
  is_carryover: boolean
  fee_missing: boolean
  display_order: number
}

type PreviewWarning = {
  code: string
  message: string
  fields?: string[]
  job_ids?: string[]
}

type PreviewResponse = {
  driver: { id: string; name: string | null; missing_fields: string[] }
  billing_year: number
  billing_month: number
  subject_preview: string
  payment_due_date_preview: string
  issuable_window: { start: string; end: string }
  is_within_window: boolean
  items: PreviewItem[]
  totals: {
    subtotal_jpy: number
    tax_jpy: number
    total_jpy: number
    tax_rate: number
    tax_mode: 'inclusive' | 'exclusive' | 'none'
  }
  warnings: PreviewWarning[]
  can_generate: boolean
}

interface DriverInvoiceCreateProps {
  driverId: string
  onCancel: () => void
  onCreated: (invoiceId: string) => void
}

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  try {
    return JSON.stringify(err)
  } catch {
    return '不明なエラー'
  }
}

// 警告コード → 表示用ラベル
const WARNING_LABELS: Record<string, string> = {
  MISSING_DRIVER_INFO: 'プロフィール情報が不足しています',
  MISSING_FEE:         '報酬未設定の案件があります（管理者にご連絡ください）',
  PERIOD_NOT_ALLOWED:  '申請可能期間外です',
  NO_APPLICATIONS:     '請求対象の確定案件がありません',
}

// 月選択肢の生成（過去12か月 + 当月）
const buildMonthOptions = (today: Date) => {
  const opts: { year: number; month: number; label: string }[] = []
  // 当月から12か月さかのぼる（合計13選択肢）
  for (let i = 0; i < 13; i++) {
    const d = subMonths(today, i)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    opts.push({ year: y, month: m, label: `${y}年${m}月` })
  }
  return opts
}

export const DriverInvoiceCreate: React.FC<DriverInvoiceCreateProps> = ({
  driverId,
  onCancel,
  onCreated,
}) => {
  const today = useMemo(() => new Date(), [])
  const defaultBilling = useMemo(() => subMonths(today, 1), [today])
  const monthOptions = useMemo(() => buildMonthOptions(today), [today])

  const [billingYear, setBillingYear]   = useState<number>(defaultBilling.getFullYear())
  const [billingMonth, setBillingMonth] = useState<number>(defaultBilling.getMonth() + 1)
  const [includeCarryover, setIncludeCarryover] = useState<boolean>(true)

  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState<boolean>(false)
  const [previewError, setPreviewError]     = useState<string | null>(null)

  // 選択された application_id の集合（fee_missing は除外で初期化）
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set())

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 月 / 含む 変更で自動 preview 取得
  useEffect(() => {
    let cancelled = false
    const fetchPreview = async () => {
      setPreviewLoading(true)
      setPreviewError(null)
      try {
        const { data, error } = await supabase.rpc('get_invoice_preview', {
          p_driver_id:         driverId,
          p_billing_year:      billingYear,
          p_billing_month:     billingMonth,
          p_include_carryover: includeCarryover,
        })
        if (cancelled) return
        if (error) throw error
        setPreview(data as PreviewResponse)
      } catch (e) {
        if (cancelled) return
        console.error(e)
        setPreviewError(`プレビュー取得に失敗しました: ${getErrorMessage(e)}`)
        setPreview(null)
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    fetchPreview()
    return () => { cancelled = true }
  }, [driverId, billingYear, billingMonth, includeCarryover])

  // preview 取得後、選択を初期化（fee_missing は除外で全件チェック）
  useEffect(() => {
    if (preview) {
      setSelectedAppIds(
        new Set(preview.items.filter((i) => !i.fee_missing).map((i) => i.application_id))
      )
    } else {
      setSelectedAppIds(new Set())
    }
  }, [preview])

  // 選択された案件のみで再計算する集計
  const selectedTotals = useMemo(() => {
    if (!preview) return null
    const checkedItems = preview.items.filter((i) => selectedAppIds.has(i.application_id))
    const subtotal = checkedItems.reduce((s, i) => s + (i.fee_per_driver ?? 0), 0)
    const taxRate = preview.totals.tax_rate
    const tax = Math.round((subtotal * taxRate) / 100)
    return {
      count: checkedItems.length,
      subtotal_jpy: subtotal,
      tax_jpy: tax,
      total_jpy: subtotal + tax,
    }
  }, [preview, selectedAppIds])

  const handleToggleItem = (applicationId: string, checked: boolean) => {
    setSelectedAppIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(applicationId)
      else next.delete(applicationId)
      return next
    })
  }

  const handleSelectAll = () => {
    if (!preview) return
    setSelectedAppIds(
      new Set(preview.items.filter((i) => !i.fee_missing).map((i) => i.application_id))
    )
  }

  const handleDeselectAll = () => setSelectedAppIds(new Set())

  const handleSubmit = async () => {
    if (!preview || preview.warnings.length > 0 || submitting) return

    const ids = Array.from(selectedAppIds)
    if (ids.length === 0) {
      setSubmitError('申請する案件を1件以上選択してください')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    setSuccess(null)

    try {
      const { data: invoiceId, error } = await supabase.rpc('generate_invoice', {
        p_driver_id:         driverId,
        p_billing_year:      billingYear,
        p_billing_month:     billingMonth,
        p_include_carryover: includeCarryover,
        p_application_ids:   ids,
      })
      if (error) throw error
      if (!invoiceId) throw new Error('invoice_id が返却されませんでした')

      setSuccess('請求書を申請しました。詳細画面へ移動します…')
      window.setTimeout(() => onCreated(invoiceId as string), 800)
    } catch (e) {
      console.error(e)
      setSubmitError(`申請に失敗しました: ${getErrorMessage(e)}`)
      setSubmitting(false)
    }
  }

  const yearOptions = useMemo(() => {
    const set = new Set(monthOptions.map((o) => o.year))
    return Array.from(set).sort((a, b) => b - a)
  }, [monthOptions])

  const monthOptionsForYear = useMemo(
    () => monthOptions.filter((o) => o.year === billingYear).map((o) => o.month),
    [monthOptions, billingYear]
  )

  return (
    <div className="w-full pb-32">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-2xl font-bold text-slate-900">請求書を作成</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            稼働月分の請求書を申請します。申請後は管理者の承認が必要です。
          </p>
        </div>
        <button
          type="button"
          className="border border-slate-300 bg-white text-slate-700 rounded-xl px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors"
          onClick={onCancel}
          disabled={submitting}
        >
          <ChevronLeft size={18} />
          戻る
        </button>
      </div>

      {/* 対象月セクション */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-4">
        <h3 className="text-base font-bold text-slate-800 mb-4 pb-2.5 border-b border-slate-100 flex items-center gap-2">
          <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
            <Calendar size={16} />
          </div>
          対象月
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={billingYear}
            onChange={(e) => {
              const y = Number(e.target.value)
              setBillingYear(y)
              // 年変更で月が範囲外になる可能性があるので、安全側に再選択
              const validMonths = monthOptions.filter((o) => o.year === y).map((o) => o.month)
              if (!validMonths.includes(billingMonth) && validMonths.length > 0) {
                setBillingMonth(validMonths[0])
              }
            }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>

          <select
            value={billingMonth}
            onChange={(e) => setBillingMonth(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white"
          >
            {monthOptionsForYear.map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>

          <label className="ml-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={includeCarryover}
              onChange={(e) => setIncludeCarryover(e.target.checked)}
              className="w-4 h-4"
            />
            過去の未請求案件も含める（繰越し）
          </label>
        </div>
      </section>

      {/* プレビュー / 警告 / エラー */}
      {previewError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{previewError}</span>
        </div>
      )}

      {previewLoading && !preview && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium flex items-center justify-center gap-2">
          <Loader2 size={18} className="animate-spin" />
          プレビューを読み込み中...
        </div>
      )}

      {preview && (
        <>
          {/* 申請可能期間バナー */}
          <section className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Info size={16} className="text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-700">
                申請可能期間: {preview.issuable_window.start} 〜 {preview.issuable_window.end}
              </span>
              {preview.is_within_window ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-bold border border-emerald-200">
                  <CheckCircle2 size={12} />
                  期間内
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px] font-bold border border-amber-200">
                  <AlertCircle size={12} />
                  期間外
                </span>
              )}
            </div>
          </section>

          {/* 警告一覧 */}
          {preview.warnings.length > 0 && (
            <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h3 className="flex items-center gap-2 font-bold text-amber-800 mb-2">
                <AlertCircle size={18} />
                申請できません（以下の問題を解決してください）
              </h3>
              <ul className="space-y-1.5 text-sm text-amber-900">
                {preview.warnings.map((w, i) => (
                  <li key={`${w.code}-${i}`} className="flex gap-2">
                    <span className="font-bold shrink-0">・</span>
                    <span>
                      <span className="font-bold">{WARNING_LABELS[w.code] ?? w.code}：</span>
                      {w.message}
                    </span>
                  </li>
                ))}
              </ul>
              {preview.warnings.some((w) => w.code === 'MISSING_DRIVER_INFO') && (
                <p className="mt-3 text-xs text-amber-800">
                  ※ プロフィール画面から不足情報を入力してください。
                </p>
              )}
            </section>
          )}

          {/* プレビュー本体 */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-4">
            <h3 className="text-base font-bold text-slate-800 mb-4 pb-2.5 border-b border-slate-100">
              プレビュー
            </h3>

            <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-6 text-sm mb-4">
              <div className="flex justify-between md:block">
                <dt className="text-slate-500">件名</dt>
                <dd className="font-semibold text-slate-900 md:mt-0.5">{preview.subject_preview}</dd>
              </div>
              <div className="flex justify-between md:block">
                <dt className="text-slate-500">支払期限</dt>
                <dd className="font-semibold text-slate-900 md:mt-0.5">
                  {formatDateLong(preview.payment_due_date_preview)}
                </dd>
              </div>
            </dl>

            {preview.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                対象案件がありません
              </div>
            ) : (
              <>
                {/* 全選択 / 全解除 + 件数表示 */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs font-bold text-slate-700 border border-slate-300 rounded px-2.5 py-1 hover:bg-slate-50"
                    disabled={submitting}
                  >
                    全選択
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-xs font-bold text-slate-700 border border-slate-300 rounded px-2.5 py-1 hover:bg-slate-50"
                    disabled={submitting}
                  >
                    全解除
                  </button>
                  <span className="ml-auto text-xs font-semibold text-slate-600">
                    {selectedAppIds.size} / {preview.items.length} 件選択中
                  </span>
                </div>

                <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {preview.items.map((item) => {
                    const { brand, pickupShort, dropoffShort } = extractBrandFromPair(
                      item.pickup,
                      item.dropoff
                    )
                    const checked  = selectedAppIds.has(item.application_id)
                    const disabled = item.fee_missing || submitting
                    const liBg = item.fee_missing
                      ? 'bg-rose-50'
                      : checked
                        ? 'bg-white'
                        : 'bg-slate-50'
                    return (
                      <li key={item.application_id} className={liBg}>
                        <label
                          className={`p-3 flex items-start gap-3 ${
                            item.fee_missing ? 'cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => handleToggleItem(item.application_id, e.target.checked)}
                            className="mt-1 w-4 h-4 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="text-slate-500 tabular-nums">{item.work_date}</span>
                              {brand && (
                                <span className="text-slate-700 font-semibold">[{brand}]</span>
                              )}
                              <span className="font-medium">{pickupShort || '?'}</span>
                              <ArrowRight size={12} className="text-slate-400 shrink-0" />
                              <span className="font-medium">{dropoffShort || '?'}</span>
                              {item.round_trip_role === 'outbound' && (
                                <span className="inline-flex items-center gap-1 rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5 text-[10px] font-bold border border-indigo-200">
                                  <Repeat size={9} />往
                                </span>
                              )}
                              {item.round_trip_role === 'return' && (
                                <span className="inline-flex items-center gap-1 rounded bg-teal-100 text-teal-700 px-1.5 py-0.5 text-[10px] font-bold border border-teal-200">
                                  <Repeat size={9} />復
                                </span>
                              )}
                              {item.is_carryover && (
                                <span className="inline-flex items-center gap-1 rounded bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[10px] font-bold border border-violet-200">
                                  繰越
                                </span>
                              )}
                              {item.fee_missing && (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-bold border border-rose-200">
                                  報酬未設定
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right tabular-nums font-semibold text-slate-900 shrink-0">
                            {item.fee_per_driver != null ? formatJPYWithSymbol(item.fee_per_driver) : '—'}
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>

                {/* 集計（選択された分のみ） */}
                {selectedTotals && (
                  <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">小計（選択した{selectedTotals.count}件）</span>
                      <span className="tabular-nums font-semibold">{formatJPY(selectedTotals.subtotal_jpy)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">消費税 ({preview.totals.tax_rate}%)</span>
                      <span className="tabular-nums font-semibold">{formatJPY(selectedTotals.tax_jpy)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-base text-slate-900">
                      <span>合計</span>
                      <span className="tabular-nums">{formatJPYWithSymbol(selectedTotals.total_jpy)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* 申請結果メッセージ */}
          {success && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}
          {submitError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              className="flex-1 border border-slate-300 bg-white text-slate-700 rounded-xl py-3.5 font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
              onClick={onCancel}
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="flex-1 bg-slate-900 text-white rounded-xl py-3.5 font-bold flex justify-center items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSubmit}
              disabled={
                preview.warnings.length > 0 ||
                selectedAppIds.size === 0 ||
                submitting ||
                !!success
              }
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {submitting ? '申請中...' : '申請する'}
            </button>
          </div>

          {!previewLoading && preview.warnings.length > 0 && (
            <p className="mt-3 text-xs text-slate-500 text-center">
              上記の警告をすべて解決すると申請ボタンが有効になります
            </p>
          )}
          {!previewLoading &&
            preview.warnings.length === 0 &&
            selectedAppIds.size === 0 && (
              <p className="mt-3 text-xs text-rose-600 text-center font-semibold">
                申請する案件を1件以上選択してください
              </p>
            )}
        </>
      )}
    </div>
  )
}
