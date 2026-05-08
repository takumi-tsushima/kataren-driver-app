import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  Printer,
  AlertCircle,
  Repeat,
  ArrowRight,
  Undo2,
  ShieldCheck,
  CheckCircle2,
  BadgeCheck,
  Trash2,
  History,
} from 'lucide-react'
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
import { ConfirmModal } from './ConfirmModal'
import './InvoiceDetail.css'

type AdminActionType = 'approve' | 'reject' | 'mark_paid' | 'cancel'

interface InvoiceDetailProps {
  invoiceId: string
  onBack: () => void
  /** 管理者操作セクション（承認・差し戻し・精算済・キャンセル）を表示するか */
  showAdminActions?: boolean
  /** 操作RPCが成功した直後に呼ばれる（一覧側で再fetchしたい場合に使用） */
  onActionCompleted?: () => void
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
  try { return JSON.stringify(err) } catch { return '不明なエラー' }
}

export const InvoiceDetail: React.FC<InvoiceDetailProps> = ({
  invoiceId,
  onBack,
  showAdminActions = false,
  onActionCompleted,
}) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null)
  const [items, setItems] = useState<InvoiceItemRow[]>([])

  // admin 操作関連
  const [actionModal, setActionModal] = useState<AdminActionType | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
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
      setError(`請求書の取得に失敗しました: ${getErrorMessage(e)}`)
    }
  }, [invoiceId])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  // 各 admin 操作の実行
  const runAction = async (action: AdminActionType, reason?: string) => {
    setActionError(null)
    let rpcName: string
    let rpcParams: Record<string, unknown>
    let successMsg: string
    switch (action) {
      case 'approve':
        rpcName = 'approve_invoice'
        rpcParams = { p_invoice_id: invoiceId }
        successMsg = '承認しました'
        break
      case 'reject':
        rpcName = 'reject_invoice'
        rpcParams = { p_invoice_id: invoiceId, p_reason: reason ?? '' }
        successMsg = '差し戻しました'
        break
      case 'mark_paid':
        rpcName = 'mark_invoice_paid'
        rpcParams = { p_invoice_id: invoiceId }
        successMsg = '精算済みにしました'
        break
      case 'cancel':
        rpcName = 'cancel_invoice'
        rpcParams = { p_invoice_id: invoiceId }
        successMsg = 'キャンセルしました'
        break
    }
    const { error: rpcError } = await supabase.rpc(rpcName, rpcParams)
    if (rpcError) {
      // ConfirmModal 内で例外として扱われ、モーダルにエラー表示される
      throw new Error(getErrorMessage(rpcError))
    }
    setActionModal(null)
    setActionMessage(successMsg)
    await fetchData()
    onActionCompleted?.()
  }

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
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3 print:hidden">
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

      {/* 履歴情報セクション（admin のみ・印刷時非表示） */}
      {showAdminActions && (
        <section className="mt-6 mx-auto max-w-4xl bg-white border border-slate-200 rounded-2xl p-5 shadow-sm print:hidden">
          <h3 className="text-base font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
            <History size={18} className="text-slate-500" />
            履歴
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6 text-sm">
            <div className="flex justify-between sm:block">
              <dt className="text-slate-500">発行日時</dt>
              <dd className="font-semibold text-slate-900">{formatDateLong(invoice.issued_at)}</dd>
            </div>
            {invoice.approved_at && (
              <div className="flex justify-between sm:block">
                <dt className="text-blue-600">承認日時</dt>
                <dd className="font-semibold text-slate-900">{formatDateLong(invoice.approved_at)}</dd>
              </div>
            )}
            {invoice.rejected_at && (
              <div className="flex justify-between sm:block">
                <dt className="text-rose-600">差し戻し日時</dt>
                <dd className="font-semibold text-slate-900">{formatDateLong(invoice.rejected_at)}</dd>
              </div>
            )}
            {invoice.paid_at && (
              <div className="flex justify-between sm:block">
                <dt className="text-emerald-600">精算日時</dt>
                <dd className="font-semibold text-slate-900">{formatDateLong(invoice.paid_at)}</dd>
              </div>
            )}
            {invoice.cancelled_at && (
              <div className="flex justify-between sm:block">
                <dt className="text-slate-500">キャンセル日時</dt>
                <dd className="font-semibold text-slate-900">{formatDateLong(invoice.cancelled_at)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* 管理者操作セクション（admin のみ・印刷時非表示） */}
      {showAdminActions && (
        <section className="mt-4 mx-auto max-w-4xl bg-white border border-slate-200 rounded-2xl p-5 shadow-sm print:hidden">
          <h3 className="text-base font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
            <ShieldCheck size={18} className="text-slate-500" />
            管理者操作
          </h3>

          {/* ステータス別ガイダンス */}
          <p className="text-sm text-slate-600 mb-4">
            {invoice.status === 'submitted' && '申請中の請求書です。承認 / 差し戻し / キャンセル ができます。'}
            {invoice.status === 'approved'  && '承認済みの請求書です。精算が完了したら精算済みに変更してください。'}
            {invoice.status === 'rejected'  && '差し戻された請求書です。必要に応じてキャンセルできます。'}
            {invoice.status === 'paid'      && '精算済みの請求書です。経理ミスの修正のためのみキャンセル可能です。'}
            {invoice.status === 'cancelled' && 'キャンセル済みの請求書です。これ以上の操作はできません。'}
          </p>

          {/* 操作ボタン群 */}
          {invoice.status !== 'cancelled' && (
            <div className="flex flex-wrap gap-2">
              {invoice.status === 'submitted' && (
                <>
                  <button
                    type="button"
                    onClick={() => { setActionMessage(null); setActionError(null); setActionModal('approve') }}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 font-bold flex items-center gap-2 transition-colors"
                  >
                    <CheckCircle2 size={18} />
                    承認
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActionMessage(null); setActionError(null); setActionModal('reject') }}
                    className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-4 py-2.5 font-bold flex items-center gap-2 transition-colors"
                  >
                    <Undo2 size={18} />
                    差し戻し
                  </button>
                </>
              )}
              {invoice.status === 'approved' && (
                <button
                  type="button"
                  onClick={() => { setActionMessage(null); setActionError(null); setActionModal('mark_paid') }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2.5 font-bold flex items-center gap-2 transition-colors"
                >
                  <BadgeCheck size={18} />
                  精算済みにする
                </button>
              )}
              <button
                type="button"
                onClick={() => { setActionMessage(null); setActionError(null); setActionModal('cancel') }}
                className="border border-slate-300 bg-white text-slate-700 rounded-xl px-4 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors"
              >
                <Trash2 size={18} />
                キャンセル
              </button>
            </div>
          )}

          {actionMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{actionMessage}</span>
            </div>
          )}
          {actionError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}
        </section>
      )}

      {/* 確認モーダル */}
      <ConfirmModal
        open={actionModal === 'approve'}
        title="請求書を承認しますか？"
        message="承認後はドライバー側で「承認済」ステータスとして表示されます。"
        confirmLabel="承認する"
        confirmColor="primary"
        onConfirm={() => runAction('approve')}
        onCancel={() => setActionModal(null)}
      />
      <ConfirmModal
        open={actionModal === 'reject'}
        title="請求書を差し戻しますか？"
        message="ドライバーには差し戻し理由が表示されます。修正の上で再申請してもらってください。"
        confirmLabel="差し戻す"
        confirmColor="danger"
        withReason
        reasonRequired
        reasonPlaceholder="例: 4/5の案件は別請求書に含まれているため、外して再申請してください。"
        onConfirm={(reason) => runAction('reject', reason)}
        onCancel={() => setActionModal(null)}
      />
      <ConfirmModal
        open={actionModal === 'mark_paid'}
        title="精算済みにしますか？"
        message="支払いが完了したことをマークします。一覧では「精算済」として表示されます。"
        confirmLabel="精算済みにする"
        confirmColor="success"
        onConfirm={() => runAction('mark_paid')}
        onCancel={() => setActionModal(null)}
      />
      <ConfirmModal
        open={actionModal === 'cancel'}
        title="請求書をキャンセルしますか？"
        message="キャンセル後は履歴として残ります。同じ案件は次回の請求書に再度含めることができます。"
        confirmLabel="キャンセルする"
        confirmColor="danger"
        onConfirm={() => runAction('cancel')}
        onCancel={() => setActionModal(null)}
      />
    </div>
  )
}
