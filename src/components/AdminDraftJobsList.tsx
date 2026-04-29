import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { RefreshCw, PlusCircle, Trash2, Edit2, Send, MapPin } from 'lucide-react'

type JobRow = {
    id: string
    work_date: string
    location: string
    capacity: number | null
    application_deadline: string | null
    note: string | null
    status: 'draft' | 'open' | 'closed' | 'cancelled'
}

type DraftJob = {
    id: string
    workDateLabel: string
    location: string
    capacity: number
    deadlineLabel: string
    note: string | null
}

type Props = {
    onNavigateToCreate: () => void
    onEdit: (jobId: string) => void
}

export const AdminDraftJobsList = ({ onNavigateToCreate, onEdit }: Props) => {
    const [jobs, setJobs] = useState<DraftJob[]>([])
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [message, setMessage] = useState('')
    const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

    const normalizeCapacity = (value: number | null | undefined) => {
        const normalized = Number(value ?? 1)
        if (!Number.isFinite(normalized) || normalized < 1) return 1
        return Math.floor(normalized)
    }

    const formatDateLabel = (value: string) => {
        try {
            return format(parseISO(value), 'yyyy/MM/dd')
        } catch {
            return value
        }
    }

    const formatDateTimeLabel = (value: string | null) => {
        if (!value) return '-'
        try {
            return format(parseISO(value), 'yyyy/MM/dd HH:mm')
        } catch {
            return value
        }
    }

    const fetchDraftJobs = useCallback(async () => {
        setLoading(true)
        setMessage('')
        setMessageType('')

        try {
            const { data, error } = await supabase
                .from('jobs')
                .select('id, work_date, location, capacity, application_deadline, note, status')
                .eq('status', 'draft')
                .order('work_date', { ascending: true })

            if (error) throw error

            const mapped: DraftJob[] = ((data ?? []) as JobRow[]).map((job) => ({
                id: job.id,
                workDateLabel: formatDateLabel(job.work_date),
                location: job.location,
                capacity: normalizeCapacity(job.capacity),
                deadlineLabel: formatDateTimeLabel(job.application_deadline),
                note: job.note,
            }))

            setJobs(mapped)
            setSelectedIds((prev) => prev.filter((id) => mapped.some((job) => job.id === id)))
        } catch (e) {
            console.error(e)
            setMessage('下書き案件の取得に失敗しました。')
            setMessageType('error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchDraftJobs()
    }, [fetchDraftJobs])

    const allSelected = useMemo(() => {
        return jobs.length > 0 && jobs.every((job) => selectedIds.includes(job.id))
    }, [jobs, selectedIds])

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds([])
            return
        }
        setSelectedIds(jobs.map((job) => job.id))
    }

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
        )
    }

    const handleBulkPublish = async () => {
        if (selectedIds.length === 0) {
            setMessage('公開する案件を選択してください。')
            setMessageType('error')
            return
        }

        const ok = window.confirm(`選択した ${selectedIds.length} 件を公開しますか？`)
        if (!ok) return

        setProcessing(true)
        setMessage('')
        setMessageType('')

        try {
            const { error } = await supabase
                .from('jobs')
                .update({ status: 'open' })
                .in('id', selectedIds)

            if (error) throw error

            setMessage('選択した案件を公開しました。')
            setMessageType('success')
            setSelectedIds([])
            await fetchDraftJobs()
        } catch (e) {
            console.error(e)
            setMessage('公開に失敗しました。')
            setMessageType('error')
        } finally {
            setProcessing(false)
        }
    }

    const handleDelete = async (jobId: string) => {
        const ok = window.confirm('この下書き案件を削除しますか？')
        if (!ok) return

        setProcessing(true)
        setMessage('')
        setMessageType('')

        try {
            const { error } = await supabase
                .from('jobs')
                .delete()
                .eq('id', jobId)
                .eq('status', 'draft')

            if (error) throw error

            setMessage('下書き案件を削除しました。')
            setMessageType('success')
            await fetchDraftJobs()
        } catch (e) {
            console.error(e)
            setMessage('削除に失敗しました。')
            setMessageType('error')
        } finally {
            setProcessing(false)
        }
    }

    if (loading) {
        return (
            <div className="w-full pb-24">
                <div className="flex justify-between items-start gap-4 mb-5 flex-wrap">
                    <div>
                        <h2 className="m-0 text-2xl font-bold text-slate-900">下書き一覧</h2>
                        <p className="mt-1.5 text-slate-600 text-sm">公開前の案件を管理できます。</p>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium">
                    読み込み中...
                </div>
            </div>
        )
    }

    return (
        <div className="w-full pb-24">
            <div className="flex justify-between items-start gap-4 mb-5 flex-wrap">
                <div>
                    <h2 className="m-0 text-2xl font-bold text-slate-900">下書き一覧</h2>
                    <p className="mt-1.5 text-slate-600 text-sm">公開前の案件を管理できます。</p>
                </div>

                <div className="flex gap-2 flex-wrap">
                    <button 
                        className="bg-white border border-slate-300 text-slate-700 rounded-xl px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors"
                        onClick={fetchDraftJobs}
                    >
                        <RefreshCw size={16} />
                        <span className="hidden sm:inline">再読み込み</span>
                    </button>
                    <button 
                        className="bg-slate-900 text-white border border-transparent rounded-xl px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors"
                        onClick={onNavigateToCreate}
                    >
                        <PlusCircle size={18} />
                        新規案件
                    </button>
                </div>
            </div>

            {message && (
                <div className={`p-3.5 rounded-xl font-semibold mb-4 ${
                    messageType === 'success' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                        : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                    {message}
                </div>
            )}

            <div className="flex justify-between items-center gap-3 flex-wrap mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <label className="flex items-center gap-2 text-slate-700 font-bold cursor-pointer">
                    <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                    />
                    <span>すべて選択</span>
                </label>
                <span className="text-sm font-medium text-slate-500">
                    {selectedIds.length > 0 ? `${selectedIds.length}件選択中` : ''}
                </span>
            </div>

            {jobs.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-slate-500 text-center font-medium shadow-sm">
                    下書き案件はありません。
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {jobs.map((job) => {
                        const checked = selectedIds.includes(job.id)

                        return (
                            <label 
                                key={job.id} 
                                className={`block bg-white border rounded-[18px] p-5 shadow-sm transition-all cursor-pointer select-none
                                    ${checked ? 'border-slate-800 ring-1 ring-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'}
                                `}
                            >
                                <div className="flex justify-between items-start gap-4 mb-4 flex-wrap">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                                                checked={checked}
                                                onChange={() => toggleSelect(job.id)}
                                            />
                                        </div>
                                        <div>
                                            <div className="font-black text-[22px] text-slate-900 leading-none mb-2">{job.workDateLabel}</div>
                                            <div className="flex items-center gap-1.5 text-slate-600 font-bold text-[15px]">
                                                <MapPin className="text-slate-400 shrink-0" size={16} />
                                                {job.location}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200 shrink-0">
                                        📝 下書き
                                    </span>
                                </div>

                                <div className="pl-8">
                                    <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100 text-sm">
                                        <span className="text-slate-500 font-semibold">定員</span>
                                        <span className="font-bold text-slate-700">{job.capacity}人</span>
                                    </div>

                                    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 text-sm">
                                        <span className="text-slate-500 font-semibold">締切</span>
                                        <span className="font-bold text-slate-700">{job.deadlineLabel}</span>
                                    </div>

                                    {job.note && (
                                        <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                            <div className="text-xs font-bold text-slate-500 mb-1">備考</div>
                                            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{job.note}</div>
                                        </div>
                                    )}

                                    <div className="flex gap-2 mt-4 flex-wrap">
                                        <button
                                            type="button"
                                            className="flex-1 bg-blue-50 text-blue-700 border border-transparent rounded-xl px-3 py-2 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                onEdit(job.id)
                                            }}
                                            disabled={processing}
                                        >
                                            <Edit2 size={16} />
                                            編集
                                        </button>

                                        <button
                                            type="button"
                                            className="flex-none bg-red-50 text-red-600 border border-transparent rounded-xl px-4 py-2 font-bold text-sm flex items-center justify-center hover:bg-red-100"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleDelete(job.id)
                                            }}
                                            disabled={processing}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </label>
                        )
                    })}
                </div>
            )}

            {/* Sticky Action Footer */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)] z-50 animate-in slide-in-from-bottom-5">
                    <div className="max-w-md mx-auto flex items-center justify-between gap-4">
                        <div className="font-bold text-slate-700">
                            <span className="text-xl text-slate-900">{selectedIds.length}</span>件 選択中
                        </div>
                        <button
                            className="flex-1 max-w-[200px] bg-slate-900 text-white rounded-xl py-3.5 font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                            onClick={handleBulkPublish}
                            disabled={processing}
                        >
                            <Send size={18} />
                            {processing ? '公開中...' : '一括公開する'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}