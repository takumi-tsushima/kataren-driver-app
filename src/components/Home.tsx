import React, { useState } from 'react'
import { format, addDays, startOfDay, isSameDay, differenceInDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
    CalendarDays,
    AlertCircle,
    ChevronRight,
    CheckCircle2,
    XCircle,
    Lock,
    UserCog,
    FileText,
    Pencil,
    ClipboardList,
    Briefcase,
    LayoutDashboard,
    Info,
} from 'lucide-react'
import type { ShiftAvailabilityData } from '../types/shift'

interface HomeProps {
    shifts: ShiftAvailabilityData[]
    isAdmin: boolean
    onNavigate: (page: 'home' | 'shift-submit' | 'admin-dashboard' | 'driver-jobs-list' | 'driver-my-jobs' | 'profile-edit' | 'driver-invoices-list') => void
    onEditDate: (date: Date) => void
}

export const Home: React.FC<HomeProps> = ({ shifts, isAdmin, onNavigate, onEditDate }) => {
    const today = startOfDay(new Date())
    const next7Days = Array.from({ length: 7 }).map((_, i) => addDays(today, i))
    const [showLockedModal, setShowLockedModal] = useState(false)

    const getDayStatus = (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const shift = shifts.find(s => s.shift_date === dateStr)
        return shift ? shift.availability_status : 'none'
    }

    // 今日から3日後までロック（4日間）。5日目以降は編集可
    const isLockedDate = (date: Date) => {
        const diff = differenceInDays(startOfDay(date), today)
        return diff < 4
    }

    const okCount = next7Days.filter(d => getDayStatus(d) === 'ok').length
    const ngCount = next7Days.filter(d => getDayStatus(d) === 'ng').length
    const unenteredCount = next7Days.filter(d => getDayStatus(d) === 'none').length

    const handleDateClick = (date: Date) => {
        if (isLockedDate(date)) {
            setShowLockedModal(true)
        } else {
            onEditDate(date)
        }
    }

    const renderStatusBadge = (status: 'ok' | 'ng' | 'none') => {
        if (status === 'ok') {
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 size={12} />OK
                </span>
            )
        }
        if (status === 'ng') {
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                    <XCircle size={12} />NG
                </span>
            )
        }
        return (
            <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                未入力
            </span>
        )
    }

    return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-3">
            {/* ① サマリーバー（直近7日のステータス集計） */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                {unenteredCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        <AlertCircle size={12} />未入力 {unenteredCount}日
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 size={12} />すべて入力済み
                    </span>
                )}
                <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500">
                        OK <span className="font-bold text-emerald-700">{okCount}</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">
                        NG <span className="font-bold text-red-600">{ngCount}</span>
                    </span>
                </div>
            </div>

            {/* ② 直近7日シフト */}
            <section className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-blue-600" />
                    <h2 className="text-[12px] font-bold text-slate-900">直近7日間のシフト</h2>
                </div>
                <ul className="flex flex-col gap-1.5">
                    {next7Days.map(date => {
                        const status = getDayStatus(date)
                        const isTodayDate = isSameDay(date, today)
                        const locked = isLockedDate(date)

                        return (
                            <li key={date.toISOString()}>
                                <button
                                    type="button"
                                    onClick={() => handleDateClick(date)}
                                    aria-label={`${format(date, 'M月d日', { locale: ja })} ${locked ? 'は編集不可' : 'のシフトを編集'}`}
                                    className={
                                        'flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left transition-colors ' +
                                        (locked
                                            ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200'
                                            : 'border-slate-200 bg-white hover:bg-blue-50 active:bg-blue-100')
                                    }
                                >
                                    <div className="flex items-center gap-1.5">
                                        {locked && <Lock size={11} className="text-slate-400" />}
                                        <span className="text-sm font-bold text-slate-800">
                                            {format(date, 'M/d', { locale: ja })}
                                        </span>
                                        <span className="text-[11px] font-medium text-slate-500">
                                            ({format(date, 'E', { locale: ja })})
                                        </span>
                                        {isTodayDate && (
                                            <span className="ml-0.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                                今日
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {renderStatusBadge(status)}
                                        {!locked && <ChevronRight size={14} className="text-slate-400" />}
                                    </div>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </section>

            {/* ③ シフト入力（強調） */}
            <button
                type="button"
                onClick={() => onNavigate('shift-submit')}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
                <Pencil size={18} />
                シフトを入力する
            </button>

            {/* ④ 自分の案件 / 募集案件（2列・コンパクト） */}
            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => onNavigate('driver-my-jobs')}
                    className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2.5 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                    <ClipboardList size={20} className="text-slate-600" />
                    <span className="text-xs font-semibold text-slate-800">自分の案件</span>
                </button>
                <button
                    type="button"
                    onClick={() => onNavigate('driver-jobs-list')}
                    className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2.5 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                    <Briefcase size={20} className="text-slate-600" />
                    <span className="text-xs font-semibold text-slate-800">募集案件</span>
                </button>
            </div>

            {/* ⑤ その他メニュー */}
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                    type="button"
                    onClick={() => onNavigate('driver-invoices-list')}
                    className="flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-sm text-slate-800 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                    <span className="flex items-center gap-3">
                        <FileText size={17} className="text-slate-500" />
                        マイ請求書
                    </span>
                    <ChevronRight size={17} className="text-slate-400" />
                </button>
                <button
                    type="button"
                    onClick={() => onNavigate('profile-edit')}
                    className="flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-sm text-slate-800 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                    <span className="flex items-center gap-3">
                        <UserCog size={17} className="text-slate-500" />
                        プロフィール編集
                    </span>
                    <ChevronRight size={17} className="text-slate-400" />
                </button>
                {isAdmin && (
                    <button
                        type="button"
                        onClick={() => onNavigate('admin-dashboard')}
                        className="flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-sm text-slate-800 transition-colors hover:bg-slate-50 active:bg-slate-100"
                    >
                        <span className="flex items-center gap-3">
                            <LayoutDashboard size={17} className="text-slate-500" />
                            管理ダッシュボード
                        </span>
                        <ChevronRight size={17} className="text-slate-400" />
                    </button>
                )}
            </div>

            {/* ロックされた日付タップ時のモーダル */}
            {showLockedModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="locked-modal-title"
                    onClick={() => setShowLockedModal(false)}
                    className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
                    >
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-blue-50 p-2 text-blue-600">
                                <Info size={20} />
                            </div>
                            <div className="min-w-0">
                                <h3 id="locked-modal-title" className="text-base font-bold text-slate-900">
                                    本日は編集できません
                                </h3>
                                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                    シフトは今日から3日後までは変更できません。
                                    <br />
                                    4日後以降の日付から入力してください。
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowLockedModal(false)}
                            className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
                        >
                            閉じる
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
