import React, { useState } from 'react'
import { format, addDays, startOfDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CheckCircle2, XCircle, Minus } from 'lucide-react'

type ShiftStatus = 'ok' | 'ng' | 'none'

interface Driver {
    id: string
    name: string
}

interface ShiftEntry {
    driverId: string
    date: string
    status: ShiftStatus
}

// ダミーデータ生成
const generateDummyData = () => {
    const drivers: Driver[] = [
        { id: 'd1', name: '佐藤 健太' },
        { id: 'd2', name: '鈴木 雅之' },
        { id: 'd3', name: '高橋 涼子' },
        { id: 'd4', name: '田中 裕二' },
        { id: 'd5', name: '伊藤 美咲' },
        { id: 'd6', name: '渡辺 翔太' },
        { id: 'd7', name: '小林 香織' },
    ]

    const today = startOfDay(new Date())
    const dates = Array.from({ length: 14 }).map((_, i) => addDays(today, i))

    const statuses: ShiftStatus[] = ['ok', 'ok', 'ok', 'ng', 'none', 'none']
    const shifts: ShiftEntry[] = []

    drivers.forEach(driver => {
        dates.forEach(date => {
            const dateStr = format(date, 'yyyy-MM-dd')
            // Randomly assign status
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
            shifts.push({ driverId: driver.id, date: dateStr, status: randomStatus })
        })
    })

    return { drivers, dates, shifts }
}

const { drivers, dates, shifts } = generateDummyData()

export const AdminShiftTable: React.FC = () => {
    const [filter, setFilter] = useState<'all' | 'ok' | 'none'>('all')

    const getShiftStatus = (driverId: string, dateStr: string) => {
        return shifts.find(s => s.driverId === driverId && s.date === dateStr)?.status || 'none'
    }

    const getDailyOkCount = (dateStr: string) => {
        return shifts.filter(s => s.date === dateStr && s.status === 'ok').length
    }

    return (
        <div className="w-full flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 m-0">シフト俯瞰ダッシュボード</h2>
                    <p className="text-slate-500 font-medium mt-1">全ドライバーのシフト状況を一括確認できます。</p>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2">
                    <span className="text-xs font-bold text-slate-500 tracking-wider">ハイライト表示</span>
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

            {/* テーブル部分：横スクロール可能かつ縦長になりすぎないように max-h 制約 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                    <table className="w-full border-collapse min-w-max text-left">
                        <thead>
                            <tr>
                                {/* 左端ヘッダーセル：縦スクロールで上に残り、横スクロールで左に残る */}
                                <th className="sticky top-0 left-0 z-30 bg-white p-4 border-b border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.02)] min-w-[140px]">
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
                            {drivers.map(driver => (
                                <tr key={driver.id} className="group hover:bg-slate-50 transition-colors">
                                    <td className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 p-4 border-b border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.02)] transition-colors">
                                        <div className="font-bold text-slate-700">{driver.name}</div>
                                    </td>
                                    {dates.map(date => {
                                        const dateStr = format(date, 'yyyy-MM-dd')
                                        const status = getShiftStatus(driver.id, dateStr)

                                        // フィルターロジック：all以外の場合は該当しないセルを少し薄くする
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
                            ))}
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
        </div>
    )
}
