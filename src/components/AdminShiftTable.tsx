import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { format, addDays, startOfDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CheckCircle2, XCircle, Minus, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { displayDriverName } from '../lib/driverDisplay'

type ShiftStatus = 'ok' | 'ng' | 'none'

type DriverRow = {
    id: string
    name: string | null
    email: string | null
    role: string
}

type ShiftRow = {
    driver_id: string
    shift_date: string
    availability_status: 'ok' | 'ng'
}

const RANGE_DAYS = 14

export const AdminShiftTable: React.FC = () => {
    const [drivers, setDrivers] = useState<DriverRow[]>([])
    const [shifts, setShifts] = useState<ShiftRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<'all' | 'ok' | 'none'>('all')

    const today = useMemo(() => startOfDay(new Date()), [])
    const dates = useMemo(
        () => Array.from({ length: RANGE_DAYS }).map((_, i) => addDays(today, i)),
        [today]
    )
    const rangeStart = useMemo(() => format(today, 'yyyy-MM-dd'), [today])
    const rangeEnd = useMemo(
        () => format(addDays(today, RANGE_DAYS - 1), 'yyyy-MM-dd'),
        [today]
    )

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

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            // 全ドライバー（admin RLS で全件取得可能。role 制限なし）
            const { data: driversData, error: driversError } = await supabase
                .from('drivers')
                .select('id, name, email, role')
                .order('name', { ascending: true, nullsFirst: false })

            if (driversError) throw new Error(`drivers 取得失敗: ${driversError.message}`)

            // 直近14日のシフト
            const { data: shiftsData, error: shiftsError } = await supabase
                .from('shift_availability')
                .select('driver_id, shift_date, availability_status')
                .gte('shift_date', rangeStart)
                .lte('shift_date', rangeEnd)

            if (shiftsError) throw new Error(`shift_availability 取得失敗: ${shiftsError.message}`)

            setDrivers((driversData ?? []) as DriverRow[])
            setShifts((shiftsData ?? []) as ShiftRow[])
        } catch (err) {
            console.error('Failed to fetch admin shift table:', err)
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }, [rangeStart, rangeEnd])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // (driver_id, date) → status の高速ルックアップ
    const shiftIndex = useMemo(() => {
        const map = new Map<string, ShiftStatus>()
        for (const s of shifts) {
            map.set(`${s.driver_id}|${s.shift_date}`, s.availability_status)
        }
        return map
    }, [shifts])

    const getShiftStatus = useCallback(
        (driverId: string, dateStr: string): ShiftStatus => {
            return shiftIndex.get(`${driverId}|${dateStr}`) ?? 'none'
        },
        [shiftIndex]
    )

    const getDailyOkCount = useCallback(
        (dateStr: string) => {
            let n = 0
            for (const driver of drivers) {
                if (getShiftStatus(driver.id, dateStr) === 'ok') n++
            }
            return n
        },
        [drivers, getShiftStatus]
    )

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-10 text-slate-500 shadow-sm">
                <Loader2 size={32} className="animate-spin text-indigo-500" />
                <p className="m-0 font-semibold">読み込んでいます...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-700 shadow-sm">
                <AlertCircle size={36} />
                <h3 className="m-0 text-lg font-bold">読み込みエラー</h3>
                <p className="m-0 text-center text-sm font-medium">{error}</p>
                <button
                    type="button"
                    onClick={fetchData}
                    className="mt-2 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-100"
                >
                    <RefreshCw size={16} /> 再読み込み
                </button>
            </div>
        )
    }

    return (
        <div className="w-full flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 m-0">シフト俯瞰ダッシュボード</h2>
                    <p className="text-slate-500 font-medium mt-1">
                        全ドライバーのシフト状況を一括確認できます。（直近 {RANGE_DAYS} 日）
                    </p>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={fetchData}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
                        >
                            <RefreshCw size={14} /> 再読み込み
                        </button>
                        <span className="text-xs font-bold text-slate-500 tracking-wider">ハイライト表示</span>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
                        {(['all', 'ok', 'none'] as const).map(f => (
                            <button
                                key={f}
                                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                    filter === f
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                                onClick={() => setFilter(f)}
                            >
                                {f === 'all' && 'すべて'}
                                {f === 'ok' && 'OKのみ'}
                                {f === 'none' && '未入力のみ'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {drivers.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
                    <p className="m-0 text-lg font-bold text-slate-700">
                        ドライバーが登録されていません
                    </p>
                    <p className="mt-2 text-sm">
                        ログインしたドライバーは drivers テーブルに自動で登録されます。
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                        <table className="w-full border-collapse min-w-max text-left">
                            <thead>
                                <tr>
                                    <th className="sticky top-0 left-0 z-30 bg-white p-4 border-b border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.02)] min-w-[180px]">
                                        <span className="text-slate-500 text-sm font-bold">ドライバー</span>
                                    </th>
                                    {dates.map(date => {
                                        const dateStr = format(date, 'MM/dd')
                                        const dayStr = format(date, 'E', { locale: ja })
                                        const isWeekend = dayStr === '土' || dayStr === '日'
                                        return (
                                            <th key={date.toISOString()} className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm p-4 border-b border-slate-200 text-center min-w-[80px]">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className={`text-[15px] font-black ${isWeekend ? 'text-indigo-600' : 'text-slate-700'}`}>{dateStr}</span>
                                                    <span className={`text-xs font-bold ${isWeekend ? 'bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded' : 'text-slate-500'}`}>
                                                        {dayStr}
                                                    </span>
                                                </div>
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {drivers.map(driver => {
                                    const label = displayDriverName(driver)
                                    return (
                                        <tr key={driver.id} className="group hover:bg-slate-50 transition-colors">
                                            <td className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 p-4 border-b border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.02)] transition-colors">
                                                <div className="font-bold text-slate-700">{label || '名前未設定'}</div>
                                                {driver.role === 'admin' && (
                                                    <span className="mt-1 inline-block rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                                        ADMIN
                                                    </span>
                                                )}
                                            </td>
                                            {dates.map(date => {
                                                const dateStr = format(date, 'yyyy-MM-dd')
                                                const status = getShiftStatus(driver.id, dateStr)
                                                const isFaded = filter !== 'all' && status !== filter

                                                return (
                                                    <td key={dateStr} className={`p-0 border-b border-slate-100 transition-opacity ${isFaded ? 'opacity-20' : 'opacity-100'}`}>
                                                        <div className="flex justify-center items-center h-full min-h-[64px]">
                                                            {status === 'ok' && (
                                                                <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl shadow-sm border border-emerald-200">
                                                                    <CheckCircle2 size={24} />
                                                                </div>
                                                            )}
                                                            {status === 'ng' && (
                                                                <div className="text-red-400 p-2">
                                                                    <XCircle size={20} />
                                                                </div>
                                                            )}
                                                            {status === 'none' && (
                                                                <div className="text-slate-300 p-2">
                                                                    <Minus size={20} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot className="sticky bottom-0 z-20">
                                <tr>
                                    <th className="sticky left-0 z-30 bg-slate-50 p-4 border-t border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                                        <span className="text-slate-600 text-sm font-bold">日別 OK 人数</span>
                                    </th>
                                    {dates.map(date => {
                                        const dateStr = format(date, 'yyyy-MM-dd')
                                        const okCount = getDailyOkCount(dateStr)
                                        return (
                                            <td key={`footer-${dateStr}`} className="bg-slate-50 p-4 border-t border-slate-200 text-center">
                                                <div className="flex flex-col items-center justify-center">
                                                    <span className="text-2xl font-black text-slate-800">{okCount}</span>
                                                    <span className="text-xs font-bold text-slate-500">人</span>
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
