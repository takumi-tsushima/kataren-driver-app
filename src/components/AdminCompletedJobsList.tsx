import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Repeat,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Undo2,
  ListChecks,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  formatJPYWithSymbol,
  formatDateLong,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from '../lib/invoiceFormat'
import { extractBrandFromPair } from '../lib/brand'
import { ConfirmModal } from './ConfirmModal'

// この画面のみで使用する請求ステータス色（他画面の INVOICE_STATUS_BADGE_CLASSES とは独立）
// 仕様: 承認済=青 / 支払済=緑 / 差戻・請求キャンセル=赤 / 申請中=グレー
const LOCAL_INVOICE_BADGE_CLASSES: Record<InvoiceStatus, string> = {
  submitted: 'bg-slate-100 text-slate-700 border-slate-200',
  approved:  'bg-blue-50 text-blue-700 border-blue-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  paid:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}

type ApplicationStatus = 'applied' | 'confirmed' | 'cancelled'
type RoundTripRole    = 'outbound' | 'return'

type CompletionRecord = {
  application_id: string
  driver_id: string
  application_status: ApplicationStatus
  completed_at: string | null
  completed_by: string | null
  completion_note: string | null
  cancelled_at: string | null
  selected_time_slot: string | null
  applied_at: string
  job_id: string
  work_date: string
  pickup_location: string | null
  dropoff_location: string | null
  area_tag: string | null
  group_id: string | null
  fee_per_driver: number | null
  driver_name: string | null
  driver_email: string | null
  completed_by_name: string | null
  round_trip_role: RoundTripRole | null
  invoice_id: string | null
  invoice_number: string | null
  invoice_status: InvoiceStatus | null
}

type CompletionStateFilter = 'all' | 'pending' | 'completed' | 'cancelled'
type InvoiceStateFilter    = 'all' | 'unbilled' | InvoiceStatus

const COMPLETION_TABS: { key: CompletionStateFilter; label: string }[] = [
  { key: 'all',       label: 'すべて' },
  { key: 'pending',   label: '未完了' },
  { key: 'completed', label: '完了' },
  { key: 'cancelled', label: 'キャンセル' },
]

const INVOICE_STATE_OPTIONS: { value: InvoiceStateFilter; label: string }[] = [
  { value: 'all',       label: 'すべて' },
  { value: 'unbilled',  label: '未請求' },
  { value: 'submitted', label: INVOICE_STATUS_LABELS.submitted },
  { value: 'approved',  label: INVOICE_STATUS_LABELS.approved },
  { value: 'paid',      label: INVOICE_STATUS_LABELS.paid },
]

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err &&
      typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  try { return JSON.stringify(err) } catch { return '不明なエラー' }
}

export const AdminCompletedJobsList = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<CompletionRecord[]>([])

  const [statusFilter,  setStatusFilter]  = useState<CompletionStateFilter>('all')
  const [driverFilter,  setDriverFilter]  = useState<string | 'all'>('all')
  const [monthFilter,   setMonthFilter]   = useState<string | 'all'>('all')
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceStateFilter>('all')

  // 操作モーダル
  const [actionModal, setActionModal] = useState<
    { type: 'complete' | 'uncomplete'; applicationId: string; subjectLine: string } | null
  >(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchRecords = async () => {
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('v_admin_completion_records')
        .select('*')
        .order('work_date', { ascending: false })
        .order('applied_at', { ascending: false })
      if (fetchError) throw fetchError
      setRecords((data ?? []) as CompletionRecord[])
    } catch (e) {
      console.error(e)
      setError(`実績一覧の取得に失敗しました: ${getErrorMessage(e)}`)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchRecords().finally(() => setLoading(false))
  }, [])

  // 派生状態の判定
  const completionState = (r: CompletionRecord): CompletionStateFilter => {
    if (r.application_status === 'cancelled') return 'cancelled'
    if (r.completed_at)                       return 'completed'
    return 'pending'
  }

  const invoiceState = (r: CompletionRecord): InvoiceStateFilter => {
    if (!r.invoice_status) return 'unbilled'
    return r.invoice_status as InvoiceStateFilter
  }

  // 件数（フィルタなしの絶対数）
  const statusCounts = useMemo(() => {
    const c: Record<CompletionStateFilter, number> = { all: records.length, pending: 0, completed: 0, cancelled: 0 }
    for (const r of records) c[completionState(r)]++
    return c
  }, [records])

  // ドライバー候補
  const driverOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of records) {
      const name = r.driver_name ?? r.driver_email ?? r.driver_id.slice(0, 8)
      if (!m.has(r.driver_id)) m.set(r.driver_id, name)
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [records])

  // 月候補
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of records) set.add(r.work_date.slice(0, 7))
    return Array.from(set).sort().reverse()
  }, [records])

  // フィルタ済み一覧
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter !== 'all' && completionState(r) !== statusFilter) return false
      if (driverFilter !== 'all' && r.driver_id !== driverFilter) return false
      if (monthFilter  !== 'all' && r.work_date.slice(0, 7) !== monthFilter) return false
      if (invoiceFilter !== 'all' && invoiceState(r) !== invoiceFilter) return false
      return true
    })
  }, [records, statusFilter, driverFilter, monthFilter, invoiceFilter])

  const buildSubjectLine = (r: CompletionRecord) => {
    const driver = r.driver_name ?? r.driver_email ?? '不明'
    return `${r.work_date}・${driver}・${r.pickup_location ?? '?'} → ${r.dropoff_location ?? '?'}`
  }

  // RPC実行
  const runAction = async () => {
    if (!actionModal) return
    setActionError(null)
    const rpcName = actionModal.type === 'complete' ? 'complete_application' : 'uncomplete_application'
    const params  = actionModal.type === 'complete'
      ? { p_application_id: actionModal.applicationId, p_note: null }
      : { p_application_id: actionModal.applicationId }
    const { error } = await supabase.rpc(rpcName, params)
    if (error) {
      throw new Error(getErrorMessage(error))
    }
    setActionMessage(actionModal.type === 'complete' ? '完了マークしました' : '完了マークを取り消しました')
    setActionModal(null)
    await fetchRecords()
  }

  return (
    <div className="w-full pb-16">
      {/* ヘッダ */}
      <div className="mb-5">
        <h2 className="m-0 text-2xl font-bold text-slate-900">実績一覧</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          完了確認・請求書状態の突合に使う一覧です。経理・運用向け。
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="ml-auto text-xs text-emerald-700 underline"
          >
            閉じる
          </button>
        </div>
      )}

      {/* ステータスタブ */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {COMPLETION_TABS.map(({ key, label }) => {
          const isActive = key === statusFilter
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold border transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {label}
              <span className={`ml-1.5 text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                ({statusCounts[key]})
              </span>
            </button>
          )
        })}
      </div>

      {/* 副フィルタ */}
      {!loading && records.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 font-bold text-slate-700">
            ドライバー
            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-semibold bg-white"
            >
              <option value="all">全員</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 font-bold text-slate-700">
            対象月
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-semibold bg-white"
            >
              <option value="all">全期間</option>
              {monthOptions.map((m) => {
                const [y, mo] = m.split('-')
                return <option key={m} value={m}>{y}年{Number(mo)}月</option>
              })}
            </select>
          </label>

          <label className="flex items-center gap-1.5 font-bold text-slate-700">
            請求状態
            <select
              value={invoiceFilter}
              onChange={(e) => setInvoiceFilter(e.target.value as InvoiceStateFilter)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-semibold bg-white"
            >
              {INVOICE_STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <span className="ml-auto text-xs font-semibold text-slate-500">
            {filtered.length} / {records.length} 件表示中
          </span>
        </div>
      )}

      {/* テーブル本体 */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium flex items-center justify-center gap-2">
          <Loader2 size={18} className="animate-spin" />
          読み込み中...
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <ListChecks size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-700">まだ確定済み応募がありません</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium text-sm">
          該当する実績はありません
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-left text-xs font-bold text-slate-700">
                  <th className="whitespace-nowrap px-3 py-2.5">稼働日</th>
                  <th className="px-3 py-2.5">区間</th>
                  <th className="whitespace-nowrap px-3 py-2.5">ドライバー</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">報酬</th>
                  <th className="whitespace-nowrap px-3 py-2.5">完了</th>
                  <th className="whitespace-nowrap px-3 py-2.5">請求</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const state = completionState(r)
                  const { brand, pickupShort, dropoffShort } = extractBrandFromPair(
                    r.pickup_location, r.dropoff_location
                  )
                  const subject = buildSubjectLine(r)
                  const stripe = i % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                  return (
                    <tr
                      key={r.application_id}
                      className={`border-b border-slate-100 ${stripe} hover:bg-slate-100/60`}
                    >
                      <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums">
                        {r.work_date}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.round_trip_role === 'outbound' && (
                            <span className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-100 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700">
                              <Repeat size={10} />往
                            </span>
                          )}
                          {r.round_trip_role === 'return' && (
                            <span className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-100 px-1.5 py-0.5 text-[11px] font-bold text-teal-700">
                              <Repeat size={10} />復
                            </span>
                          )}
                          {brand && <span className="font-semibold text-slate-700">[{brand}]</span>}
                          <span className="font-medium text-slate-800">{pickupShort || '?'}</span>
                          <ArrowRight size={12} className="shrink-0 text-slate-400" />
                          <span className="font-medium text-slate-800">{dropoffShort || '?'}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top">
                        <div className="font-semibold text-slate-900">
                          {r.driver_name ?? '(名前未登録)'}
                        </div>
                        <div className="text-xs text-slate-500">{r.driver_email ?? '-'}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-right tabular-nums">
                        {r.fee_per_driver != null ? formatJPYWithSymbol(r.fee_per_driver) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top">
                        {state === 'completed' && (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                              <CheckCircle2 size={11} /> 完了
                            </span>
                            <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                              {formatDateLong(r.completed_at)}
                            </div>
                            {r.completed_by_name && (
                              <div className="text-[11px] text-slate-500">by {r.completed_by_name}</div>
                            )}
                          </div>
                        )}
                        {state === 'pending' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            <Clock size={11} /> 未完了
                          </span>
                        )}
                        {state === 'cancelled' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                            <XCircle size={11} /> キャンセル
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top">
                        {r.invoice_status ? (
                          <div>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${LOCAL_INVOICE_BADGE_CLASSES[r.invoice_status]}`}>
                              {INVOICE_STATUS_LABELS[r.invoice_status]}
                            </span>
                            {r.invoice_number && (
                              <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                                {r.invoice_number}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            未請求
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-right">
                        {state === 'pending' && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionMessage(null); setActionError(null)
                              setActionModal({ type: 'complete', applicationId: r.application_id, subjectLine: subject })
                            }}
                            className="ml-auto flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 size={12} />
                            完了にする
                          </button>
                        )}
                        {state === 'completed' && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionMessage(null); setActionError(null)
                              setActionModal({ type: 'uncomplete', applicationId: r.application_id, subjectLine: subject })
                            }}
                            className="ml-auto flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <Undo2 size={12} />
                            完了取消
                          </button>
                        )}
                        {state === 'cancelled' && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {actionError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 確認モーダル */}
      <ConfirmModal
        open={actionModal?.type === 'complete'}
        title="この案件を完了にしますか？"
        message={actionModal?.subjectLine}
        confirmLabel="完了にする"
        confirmColor="success"
        onConfirm={runAction}
        onCancel={() => setActionModal(null)}
      />
      <ConfirmModal
        open={actionModal?.type === 'uncomplete'}
        title="完了マークを取り消しますか？"
        message={actionModal?.subjectLine}
        confirmLabel="取り消す"
        confirmColor="danger"
        onConfirm={runAction}
        onCancel={() => setActionModal(null)}
      />
    </div>
  )
}
