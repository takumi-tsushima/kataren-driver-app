import { format, parseISO } from 'date-fns'

export const COMPANY_NAME_TO = 'Pathfinder株式会社'

export type InvoiceTaxMode = 'inclusive' | 'exclusive' | 'none'
export type InvoiceStatus  =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'cancelled'
export type RoundTripRole  = 'outbound' | 'return'

export const INVOICE_STATUS_VALUES: InvoiceStatus[] = [
  'submitted',
  'approved',
  'rejected',
  'paid',
  'cancelled',
]

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  submitted: '申請中',
  approved:  '承認済',
  rejected:  '差し戻し',
  paid:      '精算済',
  cancelled: 'キャンセル',
}

// ステータスバッジ用のTailwindクラス（Pillスタイル）
export const INVOICE_STATUS_BADGE_CLASSES: Record<InvoiceStatus, string> = {
  submitted: 'bg-amber-100 text-amber-700 border-amber-200',
  approved:  'bg-blue-100 text-blue-700 border-blue-200',
  rejected:  'bg-rose-100 text-rose-700 border-rose-200',
  paid:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
}

export type InvoiceRow = {
  id: string
  driver_id: string
  invoice_number: string
  billing_year: number
  billing_month: number
  subject: string

  driver_name_snapshot: string
  driver_postal_code_snapshot: string | null
  driver_address_snapshot: string | null
  driver_phone_snapshot: string | null
  driver_email_snapshot: string | null
  bank_name_snapshot: string | null
  bank_branch_snapshot: string | null
  bank_account_type_snapshot: string | null
  bank_account_number_snapshot: string | null
  bank_account_name_snapshot: string | null

  subtotal_jpy: number
  tax_jpy: number
  total_jpy: number
  tax_rate: number
  tax_mode: InvoiceTaxMode

  payment_due_date: string

  status: InvoiceStatus
  approved_at: string | null
  approved_by: string | null
  rejected_at: string | null
  rejected_by: string | null
  reject_reason: string | null
  paid_at: string | null
  paid_by: string | null
  cancelled_at: string | null
  cancelled_by: string | null

  issued_at: string
  created_by: string
  created_at: string
  updated_at: string
}

export type InvoiceItemRow = {
  id: string
  invoice_id: string
  job_application_id: string
  work_date: string
  pickup_snapshot: string | null
  dropoff_snapshot: string | null
  area_tag_snapshot: string | null
  round_trip_role_snapshot: RoundTripRole | null
  unit_price_jpy: number
  quantity: number
  amount_jpy: number
  display_order: number
  created_at: string
}

export const formatJPY = (amount: number): string => amount.toLocaleString('ja-JP')

export const formatJPYWithSymbol = (amount: number): string => `¥${formatJPY(amount)}`

export const formatDateLong = (dateStr: string | null | undefined): string => {
  if (!dateStr) return ''
  try {
    const d = dateStr.length <= 10 ? parseISO(dateStr) : new Date(dateStr)
    return format(d, 'yyyy年MM月dd日')
  } catch {
    return dateStr
  }
}

export const formatDateShort = (dateStr: string | null | undefined): string => {
  if (!dateStr) return ''
  try {
    const d = dateStr.length <= 10 ? parseISO(dateStr) : new Date(dateStr)
    return format(d, 'yyyy/MM/dd')
  } catch {
    return dateStr
  }
}

// '1000001' → '〒100-0001' / '100-0001' → '〒100-0001' / '' → ''
export const formatPostalCode = (raw: string | null | undefined): string => {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  const digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length === 7) {
    return `〒${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3)}`
  }
  // 形式不明な場合は先頭に〒だけ付ける
  return `〒${trimmed}`
}

// 振込先1行: 'カタレン銀行 カタレン支店 普通 1234567 カタレン タロウ'
export const formatBankAccountLine = (invoice: InvoiceRow): string => {
  const parts = [
    invoice.bank_name_snapshot,
    invoice.bank_branch_snapshot,
    invoice.bank_account_type_snapshot,
    invoice.bank_account_number_snapshot,
    invoice.bank_account_name_snapshot,
  ].filter((v): v is string => Boolean(v && v.trim()))
  return parts.join(' ')
}
