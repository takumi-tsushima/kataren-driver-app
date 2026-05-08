import { useEffect, useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'

type ConfirmColor = 'primary' | 'danger' | 'success'

interface ConfirmModalProps {
  open: boolean
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  confirmColor?: ConfirmColor
  withReason?: boolean
  reasonRequired?: boolean
  reasonPlaceholder?: string
  onConfirm: (reason?: string) => Promise<void> | void
  onCancel: () => void
}

const COLOR_CLASSES: Record<ConfirmColor, string> = {
  primary: 'bg-slate-900 hover:bg-slate-800 text-white',
  danger:  'bg-rose-600 hover:bg-rose-700 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'キャンセル',
  confirmColor = 'primary',
  withReason = false,
  reasonRequired = false,
  reasonPlaceholder = '',
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // open が変わるたびにフォーム/状態をリセット
  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  // Esc キーでキャンセル
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onCancel])

  if (!open) return null

  const handleConfirm = async () => {
    setError(null)
    if (withReason && reasonRequired) {
      const trimmed = reason.trim()
      if (trimmed === '') {
        setError('理由を入力してください')
        return
      }
    }
    setSubmitting(true)
    try {
      await onConfirm(withReason ? reason.trim() : undefined)
    } catch (e) {
      setSubmitting(false)
      const msg = e instanceof Error ? e.message : '不明なエラー'
      setError(msg)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={() => { if (!submitting) onCancel() }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <h3 className="m-0 text-base font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            className="text-slate-400 hover:bg-slate-100 p-1 rounded-full transition-colors"
            onClick={onCancel}
            disabled={submitting}
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {message && <p className="m-0 text-sm text-slate-700 whitespace-pre-wrap">{message}</p>}

          {withReason && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-modal-reason" className="text-xs font-bold text-slate-700">
                理由{reasonRequired && <span className="text-rose-600 ml-1">*</span>}
              </label>
              <textarea
                id="confirm-modal-reason"
                className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white min-h-[100px] focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                placeholder={reasonPlaceholder}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (error) setError(null)
                }}
                disabled={submitting}
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            className="flex-1 border border-slate-300 bg-white text-slate-700 rounded-xl py-2.5 font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
            onClick={onCancel}
            disabled={submitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-xl py-2.5 font-bold flex justify-center items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${COLOR_CLASSES[confirmColor]}`}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
