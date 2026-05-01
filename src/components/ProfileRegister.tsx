import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { User, CheckCircle2, AlertCircle } from 'lucide-react'

interface ProfileRegisterProps {
    driverId: string
    email: string
    onRegistered: (name: string) => void
}

const NAME_MAX_LENGTH = 30

export const ProfileRegister: React.FC<ProfileRegisterProps> = ({
    driverId,
    email,
    onRegistered,
}) => {
    const [name, setName] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const validate = (value: string): string | null => {
        const trimmed = value.trim()
        if (!trimmed) return '氏名を入力してください'
        if (trimmed.length > NAME_MAX_LENGTH) {
            return `${NAME_MAX_LENGTH}文字以内で入力してください`
        }
        return null
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const validationError = validate(name)
        if (validationError) {
            setError(validationError)
            return
        }

        const trimmed = name.trim()

        setIsSaving(true)
        setError(null)

        try {
            const { error: updateError } = await supabase
                .from('drivers')
                .update({ name: trimmed })
                .eq('id', driverId)

            if (updateError) throw updateError

            onRegistered(trimmed)
        } catch (err) {
            console.error('Failed to register profile:', err)
            setError(`登録に失敗しました: ${getErrorMessage(err)}`)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-10 md:py-16">
            <div className="mx-auto w-full max-w-md">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                    <div className="mb-6 flex flex-col items-center text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                            <User size={28} />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">プロフィール登録</h1>
                        <p className="mt-2 text-sm text-slate-600">
                            初めてのご利用です。氏名を登録するとアプリの利用を開始できます。
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                            <p className="font-semibold text-slate-700">ログイン中のメール</p>
                            <p className="mt-1 break-all text-slate-900">{email}</p>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label
                                htmlFor="profile-name"
                                className="text-sm font-bold text-slate-700"
                            >
                                氏名
                                <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                                    必須
                                </span>
                            </label>
                            <p className="text-xs text-slate-600">
                                漢字フルネームで入力してください
                            </p>
                            <input
                                id="profile-name"
                                type="text"
                                inputMode="text"
                                autoComplete="name"
                                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
                                placeholder="例：山田 太郎"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value)
                                    if (error) setError(null)
                                }}
                                maxLength={NAME_MAX_LENGTH * 2}
                                disabled={isSaving}
                            />
                            <p className="text-xs text-slate-500">
                                {NAME_MAX_LENGTH}文字以内・姓名の間のスペースは任意
                            </p>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSaving}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <CheckCircle2 size={18} />
                            {isSaving ? '登録中...' : '登録してアプリを開始'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
