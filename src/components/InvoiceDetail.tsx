import { useEffect, useState } from 'react'
import { ChevronLeft, Printer, AlertCircle, Repeat, ArrowRight, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  COMPANY_NAME_TO,
  formatJPY,
  formatJPYWithSymbol,
  formatDateLong,
  formatPostalCode,
  formatBankAccountLine,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE_CLASSES,
  type InvoiceRow,
  type InvoiceItemRow,
} from '../lib/invoiceFormat'
import { extractBrandFromPair } from '../lib/brand'
import './InvoiceDetail.css'

interface InvoiceDetailProps {
  invoiceId: string
  onBack: () => void
}

export const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ invoiceId, onBack }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null)
  const [items, setItems] = useState<InvoiceItemRow[]>([])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [invoiceRes, itemsRes] = await Promise.all([
          supabase.from('invoices').select('*').eq('id', invoiceId).single(),
          supabase
            .from('invoice_items')
            .select('*')
            .eq('invoice_id', invoiceId)
            .order('display_order', { ascending: true }),
        ])

        if (invoiceRes.error) throw invoiceRes.error
        if (itemsRes.error) throw itemsRes.error

        setInvoice(invoiceRes.data as InvoiceRow)
        setItems((itemsRes.data ?? []) as InvoiceItemRow[])
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : '不明なエラー'
        setError(`請求書の取得に失敗しました: ${msg}`)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [invoiceId])

  if (loading) {
    return (
      <div className="w-full">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium">
          読み込み中...
        </div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="w-full">
        <div className="mb-4">
          <button
            type="button"
            className="border border-slate-300 bg-white text-slate-700 rounded-xl px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors"
            onClick={onBack}
          >
            <ChevronLeft size={18} />
            戻る
          </button>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error ?? '請求書が見つかりませんでした'}</span>
        </div>
      </div>
    )
  }

  const isCancelled = invoice.status === 'cancelled'
  const isRejected  = invoice.status === 'rejected'

  return (
    <div className="w-full pb-16">
      {/* 上部アクションバー（印刷時は非表示） */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          className="border border-slate-300 bg-white text-slate-700 rounded-xl px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors"
          onClick={onBack}
        >
          <ChevronLeft size={18} />
          戻る
        </button>
        <button
          type="button"
          className="bg-slate-900 text-white rounded-xl px-4 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors"
          onClick={() => window.print()}
        >
          <Printer size={18} />
          印刷 / PDF保存
        </button>
      </div>

      {/* 請求書本体 */}
      <div className="invoice-print-area mx-auto max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-sm p-8 md:p-12 text-slate-900">
        {/* ヘッダ：右上に発行日 + 請求書番号 + ステータスバッジ */}
        <header className="flex items-start justify-end text-sm">
          <div className="text-right space-y-1.5">
            <div>{formatDateLong(invoice.issued_at)}</div>
            <div>請求書番号: {invoice.invoice_number}</div>
            <div>
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold border ${INVOICE_STATUS_BADGE_CLASSES[invoice.status]}`}
              >
                {INVOICE_STATUS_LABELS[invoice.status]}
              </span>
            </div>
          </div>
        </header>

        {/* タイトル */}
        <h1 className="text-center text-4xl font-bold tracking-[0.4em] my-10">
          請　求　書
        </h1>

        {/* キャンセル赤帯（cancelled・印刷時も残す） */}
        {isCancelled && (
          <div className="mb-6 border-2 border-red-400 bg-red-50 text-red-700 px-4 py-3 text-center font-bold">
            この請求書はキャンセルされました
            {invoice.cancelled_at && <span>（{formatDateLong(invoice.cancelled_at)}）</span>}
          </div>
        )}

        {/* 差し戻し帯（rejected・印刷時も残す） */}
        {isRejected && (
          <div className="mb-6 border-2 border-orange-400 bg-orange-50 px-4 py-3 text-orange-800">
            <div className="flex items-center justify-center gap-2 font-bold">
              <Undo2 size={18} />
              この請求書は差し戻されました
              {invoice.rejected_at && <span>（{formatDateLong(invoice.rejected_at)}）</span>}
            </div>
            {invoice.reject_reason && (
              <div className="mt-2 text-sm font-semibold">
                <span className="text-orange-700">差し戻し理由：</span>
                <span className="whitespace-pre-wrap">{invoice.reject_reason}</span>
              </div>
            )}
          </div>
        )}

        {/* 宛先（左）と請求者情報（右） */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <h2 className="text-2xl font-bold mb-3">{COMPANY_NAME_TO} 御中</h2>
            <p className="text-sm mb-1">件名：{invoice.subject}</p>
            <p className="text-sm mb-6">下記のとおりご請求申し上げます。</p>

            <div className="bg-slate-100 rounded px-4 py-3 flex items-baseline justify-between">
              <span className="text-sm text-slate-700">ご請求金額</span>
              <span className="text-2xl font-bold">{formatJPYWithSymbol(invoice.total_jpy)}</span>
            </div>
            <p className="mt-3 text-sm">
              お支払期限：{formatDateLong(invoice.payment_due_date)}
            </p>
          </div>
          <div className="text-sm md:text-right md:flex md:flex-col md:items-end">
            <p className="text-base font-semibold mb-2">{invoice.driver_name_snapshot}</p>
            {invoice.driver_postal_code_snapshot && (
              <p>{formatPostalCode(invoice.driver_postal_code_snapshot)}</p>
            )}
            {invoice.driver_address_snapshot && <p>{invoice.driver_address_snapshot}</p>}
            {invoice.driver_phone_snapshot && (
              <p className="mt-2">TEL:{invoice.driver_phone_snapshot}</p>
            )}
            {invoice.driver_email_snapshot && <p>{invoice.driver_email_snapshot}</p>}
          </div>
        </section>

        {/* 明細テーブル */}
        <table className="w-full border-collapse text-sm mb-6">
          <thead>
            <tr className="bg-slate-500 text-white">
              <th className="text-center p-3 font-bold w-28">実施日</th>
              <th className="text-center p-3 font-bold">品目</th>
              <th className="text-center p-3 font-bold w-20">数量</th>
              <th className="text-center p-3 font-bold w-24">単価</th>
              <th className="text-center p-3 font-bold w-28">金額</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const { brand, pickupShort, dropoffShort } = extractBrandFromPair(
                item.pickup_snapshot,
                item.dropoff_snapshot
              )
              return (
                <tr key={item.id} className="border-b border-slate-300">
                  <td className="p-3 tabular-nums whitespace-nowrap">{item.work_date}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {brand && (
                        <span className="text-slate-700 font-semibold">[{brand}]</span>
                      )}
                      <span className="font-medium">{pickupShort || '?'}</span>
                      <ArrowRight size={14} className="text-slate-400 shrink-0" />
                      <span className="font-medium">{dropoffShort || '?'}</span>
                      {item.round_trip_role_snapshot === 'outbound' && (
                        <span className="inline-flex items-center gap-1 rounded bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[11px] font-bold border border-indigo-200">
                          <Repeat size={10} />
                          往
                        </span>
                      )}
                      {item.round_trip_role_snapshot === 'return' && (
                        <span className="inline-flex items-center gap-1 rounded bg-teal-100 text-teal-700 px-2 py-0.5 text-[11px] font-bold border border-teal-200">
                          <Repeat size={10} />
                          復
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right p-3 tabular-nums">{item.quantity}</td>
                  <td className="text-right p-3 tabular-nums">{formatJPY(item.unit_price_jpy)}</td>
                  <td className="text-right p-3 tabular-nums">{formatJPY(item.amount_jpy)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-300">
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td colSpan={2} className="text-right p-3 bg-slate-50">小計</td>
              <td className="text-right p-3 tabular-nums bg-slate-50">{formatJPY(invoice.subtotal_jpy)}</td>
            </tr>
            <tr>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td colSpan={2} className="text-right p-3 bg-slate-50">消費税 (10%)</td>
              <td className="text-right p-3 tabular-nums bg-slate-50">{formatJPY(invoice.tax_jpy)}</td>
            </tr>
            <tr className="font-bold">
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td colSpan={2} className="text-right p-3 bg-slate-100">合計</td>
              <td className="text-right p-3 tabular-nums bg-slate-100">{formatJPY(invoice.total_jpy)}</td>
            </tr>
          </tfoot>
        </table>

        {/* 税率内訳 */}
        <table className="ml-auto text-sm mb-8">
          <tbody>
            <tr className="border-b border-slate-300">
              <td className="px-4 py-1.5">10%対象</td>
              <td className="text-right tabular-nums px-4 py-1.5">{formatJPY(invoice.subtotal_jpy)}</td>
              <td className="px-4 py-1.5">消費税</td>
              <td className="text-right tabular-nums px-4 py-1.5">{formatJPY(invoice.tax_jpy)}</td>
            </tr>
            <tr>
              <td className="px-4 py-1.5">8%対象</td>
              <td className="text-right tabular-nums px-4 py-1.5">0</td>
              <td className="px-4 py-1.5">消費税</td>
              <td className="text-right tabular-nums px-4 py-1.5">0</td>
            </tr>
          </tbody>
        </table>

        {/* 振込先 */}
        <section>
          <h3 className="text-sm font-bold mb-2">振込先</h3>
          <div className="bg-slate-50 px-4 py-3 text-sm">
            {formatBankAccountLine(invoice) || <span className="text-slate-400">未登録</span>}
          </div>
        </section>
      </div>

      {/* 下部アクションバー（印刷時は非表示） */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          className="border border-slate-300 bg-white text-slate-700 rounded-xl px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors"
          onClick={onBack}
        >
          <ChevronLeft size={18} />
          戻る
        </button>
        <button
          type="button"
          className="bg-slate-900 text-white rounded-xl px-4 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors"
          onClick={() => window.print()}
        >
          <Printer size={18} />
          印刷 / PDF保存
        </button>
      </div>
    </div>
  )
}
