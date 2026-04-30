import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Calendar,
    MapPin,
    FileText,
    AlertCircle,
    Briefcase,
    Loader2,
    CheckCircle2,
    XCircle,
    Ban,
} from 'lucide-react'
import { format, parseISO, startOfDay, isBefore } from 'date-fns'
import { supabase } from '../lib/supabase'

type JobRow = {
    id: string
    work_date: string
    location: string
    note: string | null
    status: 'draft' | 'open' | 'closed' | 'cancelled' | string
}

type ApplicationWithJobRow = {
    id: string
    status: string | null
    created_at: string
    job: JobRow | null
}

type MyJobDisplayStatus = 'scheduled' | 'completed' | 'cancelled'

type CancelApplicationResult = {
    ok: boolean
    code?: string
    message?: string
}

type MyJob = {
    applicationId: string
    jobId: string
    workDate: string
    rawWorkDate: string
    location: string
    note: string | null
    displayStatus: MyJobDisplayStatus
    canCancel: boolean
}

export const DriverMyJobsList = () => {
    const [jobs, setJobs] = useState<MyJob[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [cancellingId, setCancellingId] = useState<string | null>(null)
    const [message, setMessage] = useState('')
    const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

    const formatWorkDate = (value: string) => {
        try {
            return format(parseISO(value), 'yyyy/MM/dd')
        } catch {
            return value
        }
    }

    const getDisplayStatus = (job: JobRow): MyJobDisplayStatus => {
        if (job.status === 'cancelled') return 'cancelled'
        try {
            const today = startOfDay(new Date())
            const work = startOfDay(parseISO(job.work_date))
            if (isBefore(work, today)) return 'completed'
        } catch {
            // ignore date parse errors
        }
        return 'scheduled'
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

    const fetchMyJobs = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false

        if (!silent) {
            setIsLoading(true)
            setError(null)
        }

        try {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (!user) {
                throw new Error('ログイン情報を取得できませんでした。')
            }

            const { data: driverData, error: driverError } = await supabase
                .from('drivers')
                .select('id')
                .eq('auth_user_id', user.id)
                .maybeSingle()

            if (driverError) throw driverError
            if (!driverData) {
                throw new Error('ドライバー情報を取得できませんでした。')
            }

            const { data, error: appError } = await supabase
                .from('job_applications')
                .select(
                    'id, status, created_at, job:jobs(id, work_date, location, note, status)'
                )
                .eq('driver_id', driverData.id)
                .eq('status', 'confirmed')

            if (appError) throw appError

            const rows = (data ?? []) as unknown as ApplicationWithJobRow[]

            const today = startOfDay(new Date()).getTime()

            const mapped: MyJob[] = rows
                .filter((row) => row.job !== null)
                .map((row) => {
                    const job = row.job as JobRow
                    const displayStatus = getDisplayStatus(job)
                    const canCancel = (() => {
                        if (displayStatus !== 'scheduled') return false
                        try {
                            const workStart = startOfDay(parseISO(job.work_date))
                            const todayStart = startOfDay(new Date())
                            return isBefore(todayStart, workStart)
                        } catch {
                            return false
                        }
                    })()
                    return {
                        applicationId: row.id,
                        jobId: job.id,
                        workDate: formatWorkDate(job.work_date),
                        rawWorkDate: job.work_date,
                        location: job.location,
                        note: job.note,
                        displayStatus,
                        canCancel,
                    }
                })
                .sort((a, b) => {
                    const safeTime = (value: string) => {
                        try {
                            return parseISO(value).getTime()
                        } catch {
                            return 0
                        }
                    }
                    const aTime = safeTime(a.rawWorkDate)
                    const bTime = safeTime(b.rawWorkDate)
                    const aIsFuture = aTime >= today
                    const bIsFuture = bTime >= today
                    if (aIsFuture && !bIsFuture) return -1
                    if (!aIsFuture && bIsFuture) return 1
                    if (aIsFuture) return aTime - bTime // 近い予定が上
                    return bTime - aTime // 過去は新しい順
                })

            setJobs(mapped)
        } catch (err) {
            console.error(err)
            setError(`案件の読み込みに失敗しました: ${getErrorMessage(err)}`)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchMyJobs()
    }, [fetchMyJobs])

    useEffect(() => {
        const channel = supabase
            .channel('driver-my-jobs-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'job_applications' },
                async () => {
                    await fetchMyJobs({ silent: true })
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'jobs' },
                async () => {
                    await fetchMyJobs({ silent: true })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [fetchMyJobs])

    const handleCancel = useCallback(
        async (applicationId: string) => {
            const ok = window.confirm(
                'この案件の応募をキャンセルしますか？\nキャンセル後、同じ案件への再応募はできません。'
            )
            if (!ok) return

            setCancellingId(applicationId)
            setMessage('')
            setMessageType('')

            try {
                const { data, error: rpcError } = await supabase.rpc('cancel_application', {
                    p_application_id: applicationId,
                })

                if (rpcError) throw new Error(rpcError.message)

                const result = data as CancelApplicationResult | null

                if (!result?.ok) {
                    setMessage(result?.message ?? 'キャンセルに失敗しました。')
                    setMessageType('error')
                    await fetchMyJobs({ silent: true })
                    return
                }

                setMessage(result.message || '応募をキャンセルしました。')
                setMessageType('success')
                await fetchMyJobs({ silent: true })
            } catch (err) {
                console.error(err)
                setMessage(`キャンセルに失敗しました: ${getErrorMessage(err)}`)
                setMessageType('error')
            } finally {
                setCancellingId(null)
            }
        },
        [fetchMyJobs]
    )

    const visibleJobs = useMemo(() => jobs, [jobs])

    if (isLoading) {
        return (
            <div className="w-full pb-20">
                <div className="mb-6">
                    <h2 className="m-0 text-2xl font-bold text-slate-900">自分の案件一覧</h2>
                    <p className="mt-1 text-sm text-slate-600">確定した案件を確認できます。</p>
                </div>
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-10 text-slate-500 shadow-sm">
                    <Loader2 size={32} className="animate-spin text-indigo-500" />
                    <p className="m-0 font-semibold">読み込んでいます...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="w-full pb-20">
                <div className="mb-6">
                    <h2 className="m-0 text-2xl font-bold text-slate-900">自分の案件一覧</h2>
                </div>
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
                    <AlertCircle size={48} className="text-red-500" />
                    <h3 className="m-0 text-xl font-bold">読み込みエラー</h3>
                    <p className="m-0 text-center font-medium opacity-90">{error}</p>
                    <button
                        className="mt-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 font-bold text-red-700 shadow-sm transition-colors hover:bg-red-50"
                        onClick={() => fetchMyJobs()}
                    >
                        再読み込み
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto w-full max-w-md pb-20">
            <div className="mb-5">
                <h2 className="m-0 text-2xl font-bold text-slate-900">自分の案件一覧</h2>
                <p className="mt-1 text-sm text-slate-600">確定した案件を確認できます。</p>
            </div>

            {message && (
                <div
                    className={`mb-4 rounded-xl border p-3.5 font-semibold ${
                        messageType === 'success'
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                            : 'border-red-100 bg-red-50 text-red-700'
                    }`}
                >
                    {message}
                </div>
            )}

            {visibleJobs.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-100 bg-slate-50">
                        <Briefcase size={36} className="text-slate-400" />
                    </div>
                    <h3 className="m-0 mb-2 text-lg font-bold text-slate-700">
                        確定した案件はまだありません
                    </h3>
                    <p className="m-0 text-sm font-medium text-slate-500">
                        募集案件一覧から応募してください。
                    </p>
                </div>
            ) : (
                <div className="grid gap-5">
                    {visibleJobs.map((job) => (
                        <DriverMyJobCard
                            key={job.applicationId}
                            job={job}
                            onCancel={handleCancel}
                            isCancelling={cancellingId === job.applicationId}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

const DriverMyJobCard: React.FC<{
    job: MyJob
    onCancel: (applicationId: string) => void
    isCancelling: boolean
}> = ({ job, onCancel, isCancelling }) => {
    const badge = (() => {
        switch (job.displayStatus) {
            case 'scheduled':
                return {
                    label: '予定',
                    className: 'bg-blue-100 text-blue-700 border-blue-200',
                    icon: <Calendar size={14} />,
                }
            case 'completed':
                return {
                    label: '完了',
                    className: 'bg-slate-200 text-slate-700 border-slate-300',
                    icon: <CheckCircle2 size={14} />,
                }
            case 'cancelled':
                return {
                    label: 'キャンセル',
                    className: 'bg-red-100 text-red-700 border-red-200',
                    icon: <XCircle size={14} />,
                }
        }
    })()

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
                <div className="flex items-center gap-2.5">
                    <div className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm">
                        <Calendar size={20} />
                    </div>
                    <span className="text-[19px] font-black text-slate-900">{job.workDate}</span>
                </div>

                <div
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm ${badge.className}`}
                >
                    {badge.icon}
                    {badge.label}
                </div>
            </div>

            <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                    <MapPin size={18} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="text-lg font-bold leading-tight text-slate-800">
                        {job.location}
                    </span>
                </div>

                {job.note && (
                    <div className="flex gap-2.5 rounded-xl border border-amber-100 bg-amber-50 p-3">
                        <FileText size={16} className="mt-0.5 shrink-0 text-amber-600" />
                        <p className="m-0 whitespace-pre-wrap text-sm font-medium leading-relaxed text-amber-900">
                            {job.note}
                        </p>
                    </div>
                )}

                {job.canCancel && (
                    <button
                        type="button"
                        onClick={() => onCancel(job.applicationId)}
                        disabled={isCancelling}
                        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Ban size={16} />
                        {isCancelling ? 'キャンセル中...' : '応募をキャンセル'}
                    </button>
                )}
            </div>
        </div>
    )
}
