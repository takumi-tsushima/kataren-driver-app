import { useEffect, useState } from 'react'
import {
    Calendar,
    PlusCircle,
    FileEdit,
    FolderOpen,
    Loader2,
    CheckCircle2,
    Receipt,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type AdminPageType =
    | 'admin-shift-table'
    | 'admin-job-create'
    | 'admin-draft-jobs'
    | 'admin-open-jobs'
    | 'admin-confirmed-jobs'
    | 'admin-invoices'

type Props = {
    onNavigate: (page: AdminPageType) => void
}

export const AdminDashboard = ({ onNavigate }: Props) => {
    const [draftCount, setDraftCount] = useState<number | null>(null)
    const [openCount, setOpenCount] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchKPIs = async () => {
            try {
                // Drafts count
                const { count: dCount, error: dError } = await supabase
                    .from('jobs')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'draft')

                if (dError) throw dError

                // Open count
                const { count: oCount, error: oError } = await supabase
                    .from('jobs')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'open')

                if (oError) throw oError

                setDraftCount(dCount ?? 0)
                setOpenCount(oCount ?? 0)
            } catch (err) {
                console.error('Failed to fetch KPI counts:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchKPIs()
    }, [])

    return (
        <div className="w-full mx-auto py-4">
            <div className="mb-8">
                <h2 className="mb-2 text-3xl font-bold text-slate-900">
                    管理者メニュー
                </h2>
                <p className="font-medium text-slate-500">
                    シフトや募集案件の管理を行います。
                </p>
            </div>

            {/* KPI Section */}
            <div className="mb-8 grid grid-cols-2 gap-4">
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="mb-2 text-sm font-bold text-slate-500">
                        下書きの案件数
                    </span>
                    <div className="flex items-baseline gap-2 text-3xl font-black text-slate-800">
                        {loading ? (
                            <Loader2 size={24} className="animate-spin text-slate-300" />
                        ) : (
                            draftCount
                        )}
                        {!loading && (
                            <span className="text-sm font-bold text-slate-500">件</span>
                        )}
                    </div>
                </div>

                <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="mb-2 text-sm font-bold text-slate-500">
                        掲載中の案件数
                    </span>
                    <div className="flex items-baseline gap-2 text-3xl font-black text-emerald-600">
                        {loading ? (
                            <Loader2 size={24} className="animate-spin text-emerald-300" />
                        ) : (
                            openCount
                        )}
                        {!loading && (
                            <span className="text-sm font-bold text-emerald-600/70">件</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Navigation */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-6 md:gap-5">
                <button
                    onClick={() => onNavigate('admin-shift-table')}
                    className="group flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-md active:scale-95 md:p-8"
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                        <Calendar size={28} />
                    </div>
                    <span className="font-bold text-slate-700">シフト一覧</span>
                </button>

                <button
                    onClick={() => onNavigate('admin-job-create')}
                    className="group flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-md active:scale-95 md:p-8"
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                        <PlusCircle size={28} />
                    </div>
                    <span className="font-bold text-slate-700">案件作成</span>
                </button>

                <button
                    onClick={() => onNavigate('admin-draft-jobs')}
                    className="group relative flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-md active:scale-95 md:p-8"
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-600 group-hover:text-white">
                        <FileEdit size={28} />
                    </div>
                    <span className="font-bold text-slate-700">下書き一覧</span>
                    {draftCount !== null && draftCount > 0 && !loading && (
                        <span className="absolute right-4 top-4 rounded-full bg-slate-800 px-2 py-1 text-xs font-bold text-white md:right-6 md:top-6">
                            {draftCount}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => onNavigate('admin-open-jobs')}
                    className="group relative flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-md active:scale-95 md:p-8"
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-600 transition-colors group-hover:bg-orange-600 group-hover:text-white">
                        <FolderOpen size={28} />
                    </div>
                    <span className="font-bold text-slate-700">掲載中案件</span>
                    {openCount !== null && openCount > 0 && !loading && (
                        <span className="absolute right-4 top-4 rounded-full bg-orange-500 px-2 py-1 text-xs font-bold text-white md:right-6 md:top-6">
                            {openCount}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => onNavigate('admin-confirmed-jobs')}
                    className="group flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-md active:scale-95 md:p-8"
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                        <CheckCircle2 size={28} />
                    </div>
                    <span className="font-bold text-slate-700">確定案件一覧</span>
                </button>

                <button
                    onClick={() => onNavigate('admin-invoices')}
                    className="group flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-md active:scale-95 md:p-8"
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 text-violet-600 transition-colors group-hover:bg-violet-600 group-hover:text-white">
                        <Receipt size={28} />
                    </div>
                    <span className="font-bold text-slate-700">請求書管理</span>
                </button>
            </div>

            <div className="mt-10 rounded-2xl border border-slate-200/60 bg-slate-100/70 p-5">
                <p className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800">
                    <span className="text-xl">💡</span> TIPS
                </p>
                <p className="text-sm font-medium leading-relaxed text-slate-600">
                    まずは「案件作成」から募集を作り、「下書き一覧」から公開してください。
                    <br className="hidden md:block" />
                    公開後は「掲載中案件」から進捗状況を確認できます。
                </p>
            </div>
        </div>
    )
}