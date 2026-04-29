import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, isBefore, parseISO, startOfDay } from 'date-fns'
import { RefreshCw, PlusCircle, Trash2, Edit2, PauseCircle, MapPin } from 'lucide-react'

type JobRow = {
    id: string
    work_date: string
    location: string
    capacity: number | null
    application_deadline: string | null
    note: string | null
    status: 'draft' | 'open' | 'closed' | 'cancelled'
}

type JobApplicationRow = {
    id: string
    job_id: string
    driver_id: string
    status: string | null
    created_at: string
}

type OpenJob = {
    id: string
    workDateRaw: string
    workDateLabel: string
    location: string
    capacity: number
    confirmedCount: number
    remainingSlots: number
    deadlineLabel: string
    deadlinePassed: boolean
    note: string | null
}

type Props = {
    onNavigateToCreate: () => void
    onEdit: (jobId: string) => void
}

export const AdminOpenJobsList = ({ onNavigateToCreate, onEdit }: Props) => {
    const [jobs, setJobs] = useState<OpenJob[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [message, setMessage] = useState('')
    const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')
    const [error, setError] = useState<string | null>(null)

    const normalizeCapacity = (value: number | null | undefined) => {
        const normalized = Number(value ?? 1)
        if (!Number.isFinite(normalized) || normalized < 1) return 1
        return Math.floor(normalized)
    }

    const normalizeStatus = (value: string | null | undefined) => {
        return (value ?? 'confirmed').toLowerCase()
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

    const isFutureOrToday = (dateStr: string) => {
        try {
            const target = startOfDay(parseISO(dateStr))
            const today = startOfDay(new Date())
            return target >= today
        } catch {
            return false
        }
    }

    const isDeadlinePassed = (value: string | null) => {
        if (!value) return false
        try {
            return isBefore(parseISO(value), new Date())
        } catch {
            return false
        }
    }

    const fetchJobs = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false

        if (!silent) {
            setLoading(true)
            setError(null)
        }

        try {
            const { data: jobsData, error: jobsError } = await supabase
                .from('jobs')
                .select('id, work_date, location, capacity, application_deadline, note, status')
                .eq('status', 'open')
                .order('work_date', { ascending: true })

            if (jobsError) throw jobsError

            const openJobs = ((jobsData ?? []) as JobRow[]).filter((job) =>
                isFutureOrToday(job.work_date)
            )

            if (openJobs.length === 0) {
                setJobs([])
                return
            }

            const jobIds = openJobs.map((job) => job.id)

            const { data: applicationsData, error: applicationsError } = await supabase
                .from('job_applications')
                .select('id, job_id, driver_id, status, created_at')
                .in('job_id', jobIds)

            if (applicationsError) throw applicationsError

            const applications = (applicationsData ?? []) as JobApplicationRow[]
            const confirmedCountMap = new Map<string, number>()

            applications.forEach((app) => {
                const status = normalizeStatus(app.status)
                if (status === 'confirmed') {
                    const current = confirmedCountMap.get(app.job_id) ?? 0
                    confirmedCountMap.set(app.job_id, current + 1)
                }
            })

            const mapped: OpenJob[] = openJobs.map((job) => {
                const capacity = normalizeCapacity(job.capacity)
                const confirmedCount = confirmedCountMap.get(job.id) ?? 0
                const remainingSlots = Math.max(capacity - confirmedCount, 0)
                const deadlinePassed = isDeadlinePassed(job.application_deadline)

                return {
                    id: job.id,
                    workDateRaw: job.work_date,
                    workDateLabel: formatDateLabel(job.work_date),
                    location: job.location,
                    capacity,
                    confirmedCount,
                    remainingSlots,
                    deadlineLabel: formatDateTimeLabel(job.application_deadline),
                    deadlinePassed,
                    note: job.note,
                }
            })

            setJobs(mapped)
        } catch (e) {
            console.error(e)
            setError('掲載中案件の取得に失敗しました。時間をおいて再度お試しください。')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchJobs()
    }, [fetchJobs])

    useEffect(() => {
        const channel = supabase
            .channel('admin-open-jobs-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'jobs' },
                async () => {
                    await fetchJobs({ silent: true })
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'job_applications' },
                async () => {
                    await fetchJobs({ silent: true })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [fetchJobs])

    const visibleJobs = useMemo(() => jobs, [jobs])

    const handlePause = async (jobId: string) => {
        const ok = window.confirm('この案件を公開停止しますか？')
        if (!ok) return

        setProcessingId(jobId)
        setMessage('')
        setMessageType('')

        try {
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ status: 'cancelled' })
                .eq('id', jobId)

            if (updateError) throw updateError

            setMessage('案件を公開停止しました。')
            setMessageType('success')
            await fetchJobs({ silent: true })
        } catch (e) {
            console.error(e)
            setMessage('公開停止に失敗しました。')
            setMessageType('error')
        } finally {
            setProcessingId(null)
        }
    }

    const handleDelete = async (job: OpenJob) => {
        if (job.confirmedCount > 0) {
            setMessage('確定者がいる案件は削除できません。公開停止を利用してください。')
            setMessageType('error')
            return
        }

        const ok = window.confirm('この案件を削除しますか？\n削除後は元に戻せません。')
        if (!ok) return

        setProcessingId(job.id)
        setMessage('')
        setMessageType('')

        try {
            const { error: deleteError } = await supabase
                .from('jobs')
                .delete()
                .eq('id', job.id)

            if (deleteError) throw deleteError

            setMessage('案件を削除しました。')
            setMessageType('success')
            await fetchJobs({ silent: true })
        } catch (e) {
            console.error(e)
            setMessage('削除に失敗しました。')
            setMessageType('error')
        } finally {
            setProcessingId(null)
        }
    }

    if (loading && !jobs.length) {
        return (
            <div className="w-full">
                <div className="flex justify-between items-start gap-4 mb-5 flex-wrap">
                    <div>
                        <h2 className="m-0 text-2xl font-bold text-slate-900">掲載中案件一覧</h2>
                        <p className="mt-1.5 text-slate-600 text-sm">公開中の未来案件を管理できます。</p>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 text-center font-medium shadow-sm">
                    読み込み中...
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="w-full">
                <div className="flex justify-between items-start gap-4 mb-5 flex-wrap">
                    <div>
                        <h2 className="m-0 text-2xl font-bold text-slate-900">掲載中案件一覧</h2>
                        <p className="mt-1.5 text-slate-600 text-sm">公開中の未来案件を管理できます。</p>
                    </div>
                    <button 
                        className="bg-slate-900 text-white border border-transparent rounded-xl px-3.5 py-2.5 font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                        onClick={onNavigateToCreate}
                    >
                        <PlusCircle size={18} />
                        新規案件
                    </button>
                </div>

                <div className="p-3.5 rounded-xl font-semibold mb-4 bg-red-50 text-red-700 border border-red-100">
                    {error}
                </div>

                <button
                    className="bg-white border border-slate-300 text-slate-700 rounded-xl px-4 py-2 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 w-full"
                    onClick={() => fetchJobs()}
                >
                    <RefreshCw size={16} />
                    再読み込み
                </button>
            </div>
        )
    }

    return (
        <div className="w-full">
            <div className="flex justify-between items-start gap-4 mb-5 flex-wrap">
                <div>
                    <h2 className="m-0 text-2xl font-bold text-slate-900">掲載中案件一覧</h2>
                    <p className="mt-1.5 text-slate-600 text-sm">公開中の未来案件を管理できます。</p>
                </div>

                <div className="flex gap-2 flex-wrap">
                    <button 
                        className="bg-white border border-slate-300 text-slate-700 rounded-xl px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors"
                        onClick={() => fetchJobs()}
                    >
                        <RefreshCw size={16} />
                        <span className="hidden sm:inline">再読み込み</span>
                    </button>
                    <button 
                        className="bg-slate-900 text-white border border-transparent rounded-xl px-3.5 py-2.5 font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
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

            {visibleJobs.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-slate-500 text-center font-medium shadow-sm">
                    掲載中の未来案件はありません。
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {visibleJobs.map((job) => {
                        const isProcessing = processingId === job.id
                        const hasApplicants = job.confirmedCount > 0
                        const isFull = job.remainingSlots === 0
                        const progressPercentage = Math.min(100, Math.round((job.confirmedCount / job.capacity) * 100))

                        return (
                            <div key={job.id} className="bg-white border border-slate-200 rounded-[18px] p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
                                <div className="flex flex-col gap-3 mb-4">
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <div className="font-black text-[22px] text-slate-900 leading-none mb-2">{job.workDateLabel}</div>
                                            <div className="flex items-center gap-1.5 text-slate-600 font-bold text-[15px]">
                                                <MapPin className="text-slate-400 shrink-0" size={16} />
                                                {job.location}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            {isFull ? (
                                              <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                                                  募集終了
                                              </span>
                                            ) : job.remainingSlots <= 1 ? (
                                                <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200 shadow-[0_0_8px_rgba(251,146,60,0.5)]">
                                                    🔥 残りわずか
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
                                                    ✅ 募集中
                                                </span>
                                            )}
                                            
                                            {job.deadlinePassed && (
                                                <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-red-100 text-red-700 text-xs font-bold border border-red-200">
                                                    締切超過
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-1">
                                        <div className="flex justify-between items-end mb-2">
                                            <div className="text-sm">
                                                <span className="text-slate-500 font-bold">確定 </span>
                                                <span className="text-2xl font-black text-slate-900">{job.confirmedCount}</span>
                                                <span className="text-slate-500 font-medium"> / {job.capacity}人</span>
                                            </div>
                                            {!isFull && (
                                                <div className="text-sm font-bold text-indigo-600">
                                                    残り {job.remainingSlots}枠
                                                </div>
                                            )}
                                        </div>
                                        <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-500 ${isFull ? 'bg-slate-500' : 'bg-indigo-500'}`} 
                                                style={{ width: `${progressPercentage}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100 text-sm">
                                    <span className="text-slate-500 font-semibold">締切</span>
                                    <span className="font-bold text-slate-700">{job.deadlineLabel}</span>
                                </div>

                                {job.note && (
                                    <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                        <div className="text-xs font-bold text-slate-500 mb-1">備考</div>
                                        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{job.note}</div>
                                    </div>
                                )}

                                {hasApplicants && (
                                    <div className="mt-4 text-[13px] font-semibold text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-center">
                                        ※確定者がいるため、削除ではなく公開停止を利用してください
                                    </div>
                                )}

                                <div className="flex gap-2 mt-4 flex-col sm:flex-row">
                                    <button
                                        className="flex-1 bg-blue-50 text-blue-700 border border-transparent rounded-xl px-3 py-2.5 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors disabled:opacity-50"
                                        onClick={() => onEdit(job.id)}
                                        disabled={isProcessing}
                                    >
                                        <Edit2 size={16} />
                                        <span>編集</span>
                                    </button>

                                    <button
                                        className="flex-1 bg-amber-100 text-amber-800 border border-transparent rounded-xl px-3 py-2.5 font-bold text-sm flex items-center justify-center gap-2 hover:bg-amber-200 transition-colors disabled:opacity-50"
                                        onClick={() => handlePause(job.id)}
                                        disabled={isProcessing}
                                    >
                                        <PauseCircle size={16} />
                                        <span>{isProcessing ? '処理中...' : '停止'}</span>
                                    </button>

                                    <button
                                        className={`flex-[0.5] flex items-center justify-center rounded-xl px-3 py-2.5 transition-colors text-sm font-bold
                                            ${hasApplicants 
                                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                                            }
                                        `}
                                        onClick={() => !hasApplicants && handleDelete(job)}
                                        disabled={isProcessing || hasApplicants}
                                        title={hasApplicants ? "確定者がいる案件は削除できません" : "削除"}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}