import { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  formatJPYWithSymbol,
  formatDateLong,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE_CLASSES,
  type InvoiceStatus,
} from '../lib/invoiceFormat'

type DriverEmbed = {
  id: string
  name: string | null
  email: string | null
}

type AdminInvoiceListRow = {
  id: string
  invoice_number: string
  billing_year: number
  billing_month: number
  total_jpy: number
  status: InvoiceStatus
  issued_at: string
  driver_id: string
  driver: DriverEmbed | null
}

type StatusFilter = InvoiceStatus | 'all'

interface AdminInvoicesListProps {
  onOpenInvoice: (invoiceId: string) => void
}

export const AdminInvoicesList: React.FC<AdminInvoicesListProps> = ({ onOpenInvoice }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<AdminInvoiceListRow[]>([])

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('submitted')
  const [driverFilter, setDriverFilter] = useState<string | 'all'>('all')
  const [monthFilter,  setMonthFilter]  = useState<string | 'all'>('all')

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await supabase
          .from('invoices')
          .select(`
            id, invoice_number, billing_year, billing_month, total_jpy, status, issued_at,
            driver_id,
            driver:drivers!invoices_driver_id_fkey(id, name, email)
          `)
          .order('issued_at', { ascending: false })

        if (fetchError) throw fetchError
        setInvoices((data ?? []) as unknown as AdminInvoiceListRow[])
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : '不明なエラー'
        setError(`請求書一覧の取得に失敗しました: ${msg}`)
      } finally {
        setLoading(false)
      }
    }
    fetchInvoices()
  }, [])

  // ステータス別件数（絶対数・絞り込みに依存しない）
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      submitted: 0, approved: 0, rejected: 0, paid: 0, cancelled: 0, all: invoices.length,
    }
    for (const inv of invoices) counts[inv.status]++
    return counts
  }, [invoices])

  // ドライバー候補（重複排除）
  const driverOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const inv of invoices) {
      const name = inv.driver?.name ?? inv.driver?.email ?? inv.driver_id.slice(0, 8)
      if (!m.has(inv.driver_id)) m.set(inv.driver_id, name)
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [invoices])

  // 月候補（YYYY-MM 形式・重複排除・新しい順）
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const inv of invoices) {
      set.add(`${inv.billing_year}-${String(inv.billing_month).padStart(2, '0')}`)
    }
    return Array.from(set).sort().reverse()
  }, [invoices])

  // フィルタ済み一覧
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (driverFilter !== 'all' && inv.driver_id !== driverFilter) return false
      if (monthFilter !== 'all') {
        const ym = `${inv.billing_year}-${String(inv.billing_month).padStart(2, '0')}`
        if (ym !== monthFilter) return false
      }
      return true
    })
  }, [invoices, statusFilter, driverFilter, monthFilter])

  return (
    <div className="w-full pb-16">
      <div className="mb-5">
        <h2 className="m-0 text-2xl font-bold text-slate-900">請求書管理</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          ドライバーから申請された請求書を確認・承認・差し戻し・精算管理します。
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ステータスタブ */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {(['submitted', 'approved', 'paid', 'rejected', 'cancelled', 'all'] as const).map((s) => {
          const isActive = s === statusFilter
          const label = s === 'all' ? '全件' : INVOICE_STATUS_LABELS[s as InvoiceStatus]
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold border transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {label}
              <span className={`ml-1.5 text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                ({statusCounts[s]})
              </span>
            </button>
          )
        })}
      </div>

      {/* 副フィルタ */}
      {!loading && invoices.length > 0 && (
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

          <span className="ml-auto text-xs font-semibold text-slate-500">
            {filteredInvoices.length} / {invoices.length} 件表示中
          </span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium flex items-center justify-center gap-2">
          <Loader2 size={18} className="animate-spin" />
          読み込み中...
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <FileText size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-700">発行済みの請求書はまだありません</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium text-sm">
          該当する請求書はありません
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredInvoices.map((inv) => {
            const driverLabel = inv.driver?.name
              ? inv.driver.name
              : (inv.driver?.email ?? `ID: ${inv.driver_id.slice(0, 8)}…`)
            return (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => onOpenInvoice(inv.id)}
                  className="w-full text-left bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-base font-bold text-slate-900">
                          {inv.billing_year}年{inv.billing_month}月分
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold border ${INVOICE_STATUS_BADGE_CLASSES[inv.status]}`}
                        >
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-700">
                        {driverLabel} さん
                      </div>
                      <div className="mt-1 text-xs text-slate-500 space-x-3">
                        <span>番号: {inv.invoice_number}</span>
                        <span>発行: {formatDateLong(inv.issued_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-lg font-bold text-slate-900 tabular-nums">
                        {formatJPYWithSymbol(inv.total_jpy)}
                      </span>
                      <ChevronRight size={18} className="text-slate-400" />
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
