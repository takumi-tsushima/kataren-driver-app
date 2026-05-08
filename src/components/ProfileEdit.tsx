import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Save,
  User,
  MapPin,
  Phone,
  Mail,
  Landmark,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

interface ProfileEditProps {
  driverId: string
  email: string
  onBack: () => void
}

type DriverProfileRow = {
  name: string | null
  postal_code: string | null
  address: string | null
  phone: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account_type: string | null
  bank_account_number: string | null
  bank_account_name: string | null
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: '', label: '未選択' },
  { value: '普通', label: '普通' },
  { value: '当座', label: '当座' },
] as const

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

const toNullableString = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export const ProfileEdit: React.FC<ProfileEditProps> = ({ driverId, email, onBack }) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankBranch, setBankBranch] = useState('')
  const [bankAccountType, setBankAccountType] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await supabase
          .from('drivers')
          .select(
            'name, postal_code, address, phone, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_name'
          )
          .eq('id', driverId)
          .single()

        if (fetchError) throw fetchError

        const row = data as DriverProfileRow
        setName(row.name ?? '')
        setPostalCode(row.postal_code ?? '')
        setAddress(row.address ?? '')
        setPhone(row.phone ?? '')
        setBankName(row.bank_name ?? '')
        setBankBranch(row.bank_branch ?? '')
        setBankAccountType(row.bank_account_type ?? '')
        setBankAccountNumber(row.bank_account_number ?? '')
        setBankAccountName(row.bank_account_name ?? '')
      } catch (err) {
        console.error('Failed to fetch profile:', err)
        setError(`プロフィールの取得に失敗しました: ${getErrorMessage(err)}`)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [driverId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    setSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('drivers')
        .update({
          name: toNullableString(name),
          postal_code: toNullableString(postalCode),
          address: toNullableString(address),
          phone: toNullableString(phone),
          bank_name: toNullableString(bankName),
          bank_branch: toNullableString(bankBranch),
          bank_account_type: toNullableString(bankAccountType),
          bank_account_number: toNullableString(bankAccountNumber),
          bank_account_name: toNullableString(bankAccountName),
        })
        .eq('id', driverId)

      if (updateError) throw updateError

      setSuccess('保存しました。')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError(`保存に失敗しました: ${getErrorMessage(err)}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
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

  return (
    <div className="w-full pb-32">
      <div className="mb-5">
        <h2 className="m-0 text-2xl font-bold text-slate-900">プロフィール編集</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          請求書に記載される情報を編集できます。未入力の項目は請求書生成時にエラーとなります。
        </p>
      </div>

      {success && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-4 pb-2.5 border-b border-slate-100 flex items-center gap-2">
            <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
              <User size={16} />
            </div>
            基本情報
          </h3>

          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <Mail size={14} />
                ログイン中のメール（変更不可）
              </label>
              <p className="mt-1.5 break-all text-sm font-semibold text-slate-900">{email}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-name" className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                <User size={14} />
                氏名
              </label>
              <input
                id="profile-name"
                type="text"
                autoComplete="name"
                className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-bold bg-white"
                placeholder="例: カタレン 太郎"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-postal" className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                <MapPin size={14} />
                郵便番号
              </label>
              <input
                id="profile-postal"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-semibold bg-white"
                placeholder="例: 100-0001（ハイフン任意）"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-address" className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                <MapPin size={14} />
                住所
              </label>
              <input
                id="profile-address"
                type="text"
                autoComplete="street-address"
                className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-semibold bg-white"
                placeholder="例: 東京都千代田区千代田1-1-1-101"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-phone" className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                <Phone size={14} />
                電話番号
              </label>
              <input
                id="profile-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-semibold bg-white"
                placeholder="例: 08012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-4 pb-2.5 border-b border-slate-100 flex items-center gap-2">
            <div className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg">
              <Landmark size={16} />
            </div>
            振込先口座（請求書記載用）
          </h3>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-bank-name" className="text-sm font-bold text-slate-700">
                  銀行名
                </label>
                <input
                  id="profile-bank-name"
                  type="text"
                  className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-semibold bg-white"
                  placeholder="例: カタレン銀行"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-bank-branch" className="text-sm font-bold text-slate-700">
                  支店名
                </label>
                <input
                  id="profile-bank-branch"
                  type="text"
                  className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-semibold bg-white"
                  placeholder="例: カタレン支店"
                  value={bankBranch}
                  onChange={(e) => setBankBranch(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-bank-account-type" className="text-sm font-bold text-slate-700">
                  口座種別
                </label>
                <select
                  id="profile-bank-account-type"
                  className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-semibold bg-white"
                  value={bankAccountType}
                  onChange={(e) => setBankAccountType(e.target.value)}
                  disabled={saving}
                >
                  {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-bank-account-number" className="text-sm font-bold text-slate-700">
                  口座番号
                </label>
                <input
                  id="profile-bank-account-number"
                  type="text"
                  inputMode="numeric"
                  className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-semibold bg-white"
                  placeholder="例: 1234567"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-bank-account-name" className="text-sm font-bold text-slate-700">
                口座名義（カナ）
              </label>
              <input
                id="profile-bank-account-name"
                type="text"
                className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3 text-sm font-semibold bg-white"
                placeholder="例: カタレン タロウ"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        </section>

        <div className="flex gap-3 flex-col sm:flex-row pt-2">
          <button
            type="button"
            className="flex-1 border border-slate-300 bg-white text-slate-700 rounded-xl py-3.5 font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
            onClick={onBack}
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="flex-1 bg-slate-900 text-white rounded-xl py-3.5 font-bold flex justify-center items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
            disabled={saving}
          >
            <Save size={18} />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}
