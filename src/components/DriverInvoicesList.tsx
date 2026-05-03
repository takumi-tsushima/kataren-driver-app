import { useEffect, useState } from 'react'
import { FileText, ChevronRight, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatJPYWithSymbol, formatDateLong } from '../lib/invoiceFormat'

type InvoiceListRow = {
  id: string
  invoice_number: string
  billing_year: number
  billing_month: number
  total_jpy: number
  status: 'issued' | 'cancelled'
  issued_at: string
}

interface DriverInvoicesListProps {
  driverId: string
  onOpenInvoice: (invoiceId: string) => void
}

export const DriverInvoicesList: React.FC<DriverInvoicesListProps> = ({
  driverId,
  onOpenInvoice,
}) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([])

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await supabase
          .from('invoices')
          .select('id, invoice_number, billing_year, billing_month, total_jpy, status, issued_at')
          .eq('driver_id', driverId)
          .order('issued_at', { ascending: false })

        if (fetchError) throw fetchError
        setInvoices((data ?? []) as InvoiceListRow[])
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : '不明なエラー'
        setError(`請求書一覧の取得に失敗しました: ${msg}`)
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()
  }, [driverId])

  return (
    <div className="w-full pb-16">
      <div className="mb-5">
        <h2 className="m-0 text-2xl font-bold text-slate-900">マイ請求書</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          発行済みの請求書を確認・印刷できます。生成機能は今後追加予定です。
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium">
          読み込み中...
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <FileText size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-700">発行済みの請求書はまだありません</p>
          <p className="mt-1 text-xs text-slate-500">
            稼働月の翌月1日〜7日に請求書を作成できる機能を準備中です。
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {invoices.map((inv) => {
            const isCancelled = inv.status === 'cancelled'
            return (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => onOpenInvoice(inv.id)}
                  className="w-full text-left bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-base font-bold text-slate-900">
                          {inv.billing_year}年{inv.billing_month}月分
                        </span>
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-bold border border-rose-200">
                            <XCircle size={12} />
                            キャンセル済
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-bold border border-emerald-200">
                            <CheckCircle2 size={12} />
                            発行済
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 space-x-3">
                        <span>請求書番号: {inv.invoice_number}</span>
                        <span>発行日: {formatDateLong(inv.issued_at)}</span>
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
