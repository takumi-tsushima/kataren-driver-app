import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Calendar,
    MapPin,
    Users,
    Clock,
    FileText,
    AlertCircle,
    Briefcase,
    ChevronRight,
    Loader2,
    CheckCircle2,
    XCircle,
    Ban,
    Repeat,
} from 'lucide-react'
import { format, isBefore, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { formatJobRoute, isRoundTrip } from '../lib/jobLocation'

type DriverRow = {
    id: string
    email: string
    name: string | null
}

type JobRow = {
    id: string
    work_date: string
    location: string | null
    pickup_location: string | null
    dropoff_location: string | null
    area_tag: string | null
    group_id: string | null
    capacity: number | null
    application_deadline: string | null
    note: string | null
    status: 'draft' | 'open' | 'closed' | 'cancelled' | string
}

type JobApplicationRow = {
    id: string
    job_id: string
    driver_id: string
    status: string | null
    created_at: string
}

type DriverJobDisplayStatus =
    | 'open'
    | 'few_left'
    | 'full'
    | 'closed'
    | 'deadline_passed'
    | 'applied'
    | 'cancelled'

type DriverJob = {
    id: string
    workDate: string
    rawWorkDate: string
    location: string | null
    pickup_location: string | null
    dropoff_location: string | null
    area_tag: string | null
    group_id: string | null
    capacity: number
    confirmedCount: number
    remainingSlots: number
    deadline: string
    rawDeadline: string | null
    note: string | null
    displayStatus: DriverJobDisplayStatus
    canApply: boolean
}

type ApplyForJobResult = {
    ok: boolean
    code: string
    message: string
}

type RoundTripCard = {
    kind: 'round_trip'
    groupId: string
    legs: [DriverJob, DriverJob]
    canApplySet: boolean
    disabledReason: string | null
}

type DriverCard = { kind: 'single'; job: DriverJob } | RoundTripCard

const ACTIVE_APPLICATION_STATUSES = new Set([
    'confirmed',
    'applied',
    'pending',
])

const displayStatusLabel = (status: DriverJobDisplayStatus): string => {
    switch (status) {
        case 'full':
            return '満員'
        case 'closed':
            return '募集終了'
        case 'deadline_passed':
            return '締切超過'
        case 'applied':
            return '応募済み'
        case 'cancelled':
            return '停止中'
        default:
            return ''
    }
}

const isLegApplyable = (leg: DriverJob): boolean =>
    leg.displayStatus === 'open' || leg.displayStatus === 'few_left'

export const DriverJobsList = () => {
    const [driver, setDriver] = useState<DriverRow | null>(null)
    const [jobs, setJobs] = useState<DriverJob[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isApplyingId, setIsApplyingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState('')
    const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

    const formatWorkDate = (value: string) => {
        try {
            return format(parseISO(value), 'yyyy/MM/dd')
        } catch {
            return value
        }
    }

    const formatDeadline = (value: string | null) => {
        if (!value) return '-'
        try {
            return format(parseISO(value), 'yyyy/MM/dd HH:mm')
        } catch {
            return value
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

    const normalizeCapacity = (capacity: number | null | undefined) => {
        const normalized = Number(capacity ?? 1)
        if (!Number.isFinite(normalized) || normalized < 1) return 1
        return Math.floor(normalized)
    }

    const normalizeApplicationStatus = (status: string | null | undefined) => {
        return (status ?? 'confirmed').toLowerCase()
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

    const getDisplayStatus = (params: {
        jobStatus: string | null | undefined
        rawDeadline: string | null
        remainingSlots: number
        hasApplied: boolean
    }): DriverJobDisplayStatus => {
        const { jobStatus, rawDeadline, remainingSlots, hasApplied } = params

        if (jobStatus === 'cancelled') return 'cancelled'
        if (hasApplied) return 'applied'
        if (isDeadlinePassed(rawDeadline)) return 'deadline_passed'
        if (remainingSlots <= 0) return 'full'
        if (jobStatus !== 'open') return 'closed'
        if (remainingSlots <= 1) return 'few_left'
        return 'open'
    }

    const fetchJobs = useCallback(async (options?: { silent?: boolean }) => {
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
                .select('id, email, name')
                .eq('auth_user_id', user.id)
                .maybeSingle()

            if (driverError) throw driverError
            if (!driverData) {
                throw new Error('ドライバー情報を取得できませんでした。')
            }

            setDriver(driverData)

            const { data: jobsData, error: jobsError } = await supabase
                .from('jobs')
                .select('id, work_date, location, pickup_location, dropoff_location, area_tag, group_id, capacity, application_deadline, note, status')
                .eq('status', 'open')
                .order('work_date', { ascending: true })

            if (jobsError) throw jobsError

            const openJobs = (jobsData ?? []) as JobRow[]

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
            const myAppliedJobIdSet = new Set<string>()

            applications.forEach((app) => {
                const status = normalizeApplicationStatus(app.status)

                if (ACTIVE_APPLICATION_STATUSES.has(status)) {
                    const current = confirmedCountMap.get(app.job_id) ?? 0
                    confirmedCountMap.set(app.job_id, current + 1)
                }

                if (app.driver_id === driverData.id && ACTIVE_APPLICATION_STATUSES.has(status)) {
                    myAppliedJobIdSet.add(app.job_id)
                }
            })

            const mapped = openJobs
                .map((job) => {
                    const capacity = normalizeCapacity(job.capacity)
                    const confirmedCount = confirmedCountMap.get(job.id) ?? 0
                    const remainingSlots = Math.max(capacity - confirmedCount, 0)
                    const hasApplied = myAppliedJobIdSet.has(job.id)

                    const displayStatus = getDisplayStatus({
                        jobStatus: job.status,
                        rawDeadline: job.application_deadline,
                        remainingSlots,
                        hasApplied,
                    })

                    const canApply = displayStatus === 'open' || displayStatus === 'few_left'

                    return {
                        id: job.id,
                        workDate: formatWorkDate(job.work_date),
                        rawWorkDate: job.work_date,
                        location: job.location,
                        pickup_location: job.pickup_location,
                        dropoff_location: job.dropoff_location,
                        area_tag: job.area_tag,
                        group_id: job.group_id,
                        capacity,
                        confirmedCount,
                        remainingSlots,
                        deadline: formatDeadline(job.application_deadline),
                        rawDeadline: job.application_deadline,
                        note: job.note,
                        displayStatus,
                        canApply,
                    } as DriverJob
                })
                .filter((job) => job.displayStatus !== 'cancelled')

            setJobs(mapped)
        } catch (err) {
            console.error(err)
            setError(`案件の読み込みに失敗しました: ${getErrorMessage(err)}`)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchJobs()
    }, [fetchJobs])

    useEffect(() => {
        const channel = supabase
            .channel('driver-jobs-realtime')
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

    const handleRefresh = () => {
        fetchJobs()
    }

    const handleApply = async (jobId: string) => {
        if (!driver) return

        const targetJob = jobs.find((job) => job.id === jobId)
        if (!targetJob) return

        if (!targetJob.canApply) {
            setMessage('この案件は現在応募できません。')
            setMessageType('error')
            return
        }

        if (isDeadlinePassed(targetJob.rawDeadline)) {
            setMessage('この案件は締切を過ぎているため応募できません。')
            setMessageType('error')
            await fetchJobs({ silent: true })
            return
        }

        if (targetJob.remainingSlots <= 0) {
            setMessage('この案件は満員のため応募できません。')
            setMessageType('error')
            await fetchJobs({ silent: true })
            return
        }

        const confirmed = window.confirm(
            'この案件に応募しますか？\n応募した時点で案件確定となります。'
        )
        if (!confirmed) return

        setIsApplyingId(jobId)
        setMessage('')
        setMessageType('')

        try {
            const { data, error: rpcError } = await supabase.rpc('apply_for_job', {
                p_job_id: jobId,
                p_driver_id: driver.id,
            })

            if (rpcError) {
                throw new Error(rpcError.message)
            }

            const result = data as ApplyForJobResult | null

            if (!result?.ok) {
                setMessage(result?.message ?? '応募に失敗しました。')
                setMessageType('error')
                await fetchJobs({ silent: true })
                return
            }

            setMessage(result.message || '応募が確定しました。')
            setMessageType('success')
            await fetchJobs({ silent: true })
        } catch (err) {
            console.error(err)
            setMessage(`応募に失敗しました: ${getErrorMessage(err)}`)
            setMessageType('error')
            await fetchJobs({ silent: true })
        } finally {
            setIsApplyingId(null)
        }
    }

    const handleApplyRoundTrip = async (card: RoundTripCard) => {
        if (!driver) return

        if (!card.canApplySet) {
            setMessage(
                `この往復案件は現在応募できません${card.disabledReason ? `（${card.disabledReason}）` : ''}`
            )
            setMessageType('error')
            return
        }

        const confirmed = window.confirm(
            'この往復案件（往路・復路）にまとめて応募しますか？\n応募した時点で2件まとめて確定となります。'
        )
        if (!confirmed) return

        setIsApplyingId(card.groupId)
        setMessage('')
        setMessageType('')

        try {
            const { data, error: rpcError } = await supabase.rpc('apply_for_round_trip', {
                p_group_id: card.groupId,
                p_driver_id: driver.id,
            })

            if (rpcError) {
                throw new Error(rpcError.message)
            }

            const result = data as ApplyForJobResult | null

            if (!result?.ok) {
                setMessage(result?.message ?? '応募に失敗しました。')
                setMessageType('error')
                await fetchJobs({ silent: true })
                return
            }

            setMessage(result.message || '往復案件（往路・復路）に応募しました。')
            setMessageType('success')
            await fetchJobs({ silent: true })
        } catch (err) {
            console.error(err)
            setMessage(`応募に失敗しました: ${getErrorMessage(err)}`)
            setMessageType('error')
            await fetchJobs({ silent: true })
        } finally {
            setIsApplyingId(null)
        }
    }

    // group_id ごとに集約してカード化（往復2件 = 1カード、不整合は単独として表示）
    const visibleCards: DriverCard[] = useMemo(() => {
        const groupMap = new Map<string, DriverJob[]>()
        const singles: DriverJob[] = []

        for (const job of jobs) {
            if (job.group_id) {
                const arr = groupMap.get(job.group_id) ?? []
                arr.push(job)
                groupMap.set(job.group_id, arr)
            } else {
                singles.push(job)
            }
        }

        const result: DriverCard[] = []

        for (const [groupId, legs] of groupMap) {
            if (legs.length === 2) {
                // 安定した順序：id 昇順を「往路 → 復路」として扱う
                const sorted = [...legs].sort((a, b) => a.id.localeCompare(b.id))

                const canApplySet = isLegApplyable(sorted[0]) && isLegApplyable(sorted[1])
                let disabledReason: string | null = null
                if (!canApplySet) {
                    const reasons: string[] = []
                    if (!isLegApplyable(sorted[0])) {
                        const label = displayStatusLabel(sorted[0].displayStatus)
                        if (label) reasons.push(`往路：${label}`)
                    }
                    if (!isLegApplyable(sorted[1])) {
                        const label = displayStatusLabel(sorted[1].displayStatus)
                        if (label) reasons.push(`復路：${label}`)
                    }
                    disabledReason = reasons.join(' / ') || '応募できない区間があります'
                }

                result.push({
                    kind: 'round_trip',
                    groupId,
                    legs: [sorted[0], sorted[1]],
                    canApplySet,
                    disabledReason,
                })
            } else {
                // 不整合：1件しかなければ片道として表示
                for (const leg of legs) {
                    result.push({ kind: 'single', job: leg })
                }
            }
        }

        for (const job of singles) {
            result.push({ kind: 'single', job })
        }

        // 全カードを稼働日昇順でソート
        result.sort((a, b) => {
            const dateA = a.kind === 'single' ? a.job.rawWorkDate : a.legs[0].rawWorkDate
            const dateB = b.kind === 'single' ? b.job.rawWorkDate : b.legs[0].rawWorkDate
            return dateA.localeCompare(dateB)
        })

        return result
    }, [jobs])


    if (isLoading) {
        return (
            <div className="w-full pb-20">
                <div className="mb-6">
                    <h2 className="m-0 text-2xl font-bold text-slate-900">募集案件一覧</h2>
                    <p className="mt-1 text-sm text-slate-600">現在募集中のシフト案件です。</p>
                </div>
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-10 text-slate-500 shadow-sm">
                    <Loader2 size={32} className="animate-spin text-indigo-500" />
                    <p className="m-0 font-semibold">案件を読み込んでいます...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="w-full pb-20">
                <div className="mb-6">
                    <h2 className="m-0 text-2xl font-bold text-slate-900">募集案件一覧</h2>
                </div>
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
                    <AlertCircle size={48} className="text-red-500" />
                    <h3 className="m-0 text-xl font-bold">読み込みエラー</h3>
                    <p className="m-0 text-center font-medium opacity-90">{error}</p>
                    <button
                        className="mt-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 font-bold text-red-700 shadow-sm transition-colors hover:bg-red-50"
                        onClick={handleRefresh}
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
                <h2 className="m-0 text-2xl font-bold text-slate-900">募集案件一覧</h2>
                <p className="mt-1 text-sm text-slate-600">
                    現在募集中のシフト案件を確認・応募できます。
                </p>
            </div>

            {message && (
                <div
                    className={`mb-6 rounded-xl border p-4 font-semibold shadow-sm ${messageType === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-red-200 bg-red-50 text-red-800'
                        }`}
                >
                    {message}
                </div>
            )}

            {visibleCards.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-100 bg-slate-50">
                        <Briefcase size={36} className="text-slate-400" />
                    </div>
                    <h3 className="m-0 mb-2 text-lg font-bold text-slate-700">
                        現在募集中の案件はありません
                    </h3>
                    <p className="m-0 text-sm font-medium text-slate-500">
                        新しい案件が公開されるまでお待ちください。
                    </p>
                </div>
            ) : (
                <div className="grid gap-5">
                    {visibleCards.map((card) => {
                        if (card.kind === 'round_trip') {
                            return (
                                <RoundTripJobCard
                                    key={`rt-${card.groupId}`}
                                    card={card}
                                    isApplying={isApplyingId === card.groupId}
                                    onApply={() => handleApplyRoundTrip(card)}
                                />
                            )
                        }
                        return (
                            <DriverJobCard
                                key={card.job.id}
                                job={card.job}
                                isApplying={isApplyingId === card.job.id}
                                onApply={() => handleApply(card.job.id)}
                            />
                        )
                    })}
                </div>
            )}
        </div>
    )
}

const DriverJobCard: React.FC<{
    job: DriverJob
    onApply: () => void
    isApplying: boolean
}> = ({ job, onApply, isApplying }) => {
    const isFewLeft = job.displayStatus === 'few_left'
    const isOpen = job.displayStatus === 'open' || job.displayStatus === 'few_left'
    const isDisabled = !job.canApply || isApplying

    const badge = (() => {
        switch (job.displayStatus) {
            case 'few_left':
                return {
                    label: '残りわずか',
                    className: 'bg-orange-500 text-white border-orange-600',
                    icon: <AlertCircle size={14} />,
                }
            case 'open':
                return {
                    label: '募集中',
                    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                    icon: null,
                }
            case 'full':
                return {
                    label: '満員',
                    className: 'bg-slate-200 text-slate-700 border-slate-300',
                    icon: <Ban size={14} />,
                }
            case 'closed':
                return {
                    label: '募集終了',
                    className: 'bg-slate-200 text-slate-700 border-slate-300',
                    icon: <XCircle size={14} />,
                }
            case 'deadline_passed':
                return {
                    label: '締切超過',
                    className: 'bg-red-100 text-red-700 border-red-200',
                    icon: <Clock size={14} />,
                }
            case 'applied':
                return {
                    label: '応募済み',
                    className: 'bg-indigo-100 text-indigo-700 border-indigo-200',
                    icon: <CheckCircle2 size={14} />,
                }
            case 'cancelled':
                return {
                    label: '停止中',
                    className: 'bg-amber-100 text-amber-800 border-amber-200',
                    icon: <Ban size={14} />,
                }
            default:
                return {
                    label: '募集終了',
                    className: 'bg-slate-200 text-slate-700 border-slate-300',
                    icon: null,
                }
        }
    })()

    return (
        <div
            className={`overflow-hidden rounded-2xl border bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 ${isFewLeft
                    ? 'relative border-orange-300'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
        >
            <div
                className={`flex items-center justify-between border-b px-5 py-4 ${isFewLeft ? 'border-orange-100 bg-orange-50' : 'border-slate-100 bg-slate-50'
                    }`}
            >
                <div className="flex items-center gap-2.5">
                    <div
                        className={`rounded-lg p-2 ${isFewLeft
                                ? 'bg-orange-100 text-orange-600'
                                : 'border border-slate-200 bg-white text-slate-700 shadow-sm'
                            }`}
                    >
                        <Calendar size={20} />
                    </div>
                    <span className={`text-[19px] font-black ${isFewLeft ? 'text-orange-900' : 'text-slate-900'}`}>
                        {job.workDate}
                    </span>
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
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold leading-tight text-slate-800">
                            {formatJobRoute(job)}
                        </span>
                        {isRoundTrip(job) && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700 border border-violet-200">
                                <Repeat size={12} /> 往復
                            </span>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-600">
                            <Users size={16} />
                            <span className="text-sm font-bold">募集状況</span>
                        </div>
                        <div
                            className={`flex items-center gap-1 text-lg font-black ${job.remainingSlots <= 1 ? 'text-orange-600' : 'text-indigo-600'
                                }`}
                        >
                            残り {job.remainingSlots} 枠
                        </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                            定員: {job.capacity}名
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                            確定: {job.confirmedCount}名
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 text-sm font-bold text-slate-600">
                    <Clock size={18} className="shrink-0 text-slate-400" />
                    <span className={`${isOpen ? 'text-red-600' : 'text-slate-500'} flex-1`}>
                        締切: {job.deadline}
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
            </div>

            <div className="border-t border-slate-100 bg-slate-50 p-4">
                <button
                    className={`group relative w-full overflow-hidden rounded-xl py-4 text-lg font-bold transition-all active:scale-[0.98] ${isDisabled
                            ? 'cursor-not-allowed bg-slate-300 text-slate-600 shadow-none'
                            : 'bg-indigo-600 text-white shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:bg-indigo-700 hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)]'
                        }`}
                    onClick={onApply}
                    disabled={isDisabled}
                >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        {isApplying ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                確定処理中...
                            </>
                        ) : !job.canApply ? (
                            '現在応募できません'
                        ) : (
                            <>
                                この案件に応募する
                                <ChevronRight
                                    size={20}
                                    className="transition-transform group-hover:translate-x-1"
                                />
                            </>
                        )}
                    </span>

                    {!isDisabled && (
                        <div className="absolute inset-0 h-full w-full -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                    )}
                </button>
            </div>
        </div>
    )
}

const RoundTripJobCard: React.FC<{
    card: RoundTripCard
    onApply: () => void
    isApplying: boolean
}> = ({ card, onApply, isApplying }) => {
    const [out, ret] = card.legs
    const isDisabled = !card.canApplySet || isApplying

    // 表示用：稼働日は往路のものを優先（通常は同日のはず）
    const headerDate = out.workDate
    // 残枠はセット応募で2件確定なので、両レッグの最小値が実質の制約
    const minRemaining = Math.min(out.remainingSlots, ret.remainingSlots)
    const isFewLeft = card.canApplySet && minRemaining <= 1

    return (
        <div
            className={`overflow-hidden rounded-2xl border bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 ${
                isFewLeft ? 'relative border-orange-300' : 'border-violet-200 hover:border-violet-300'
            }`}
        >
            <div
                className={`flex items-center justify-between border-b px-5 py-4 ${
                    isFewLeft ? 'border-orange-100 bg-orange-50' : 'border-violet-100 bg-violet-50'
                }`}
            >
                <div className="flex items-center gap-2.5">
                    <div
                        className={`rounded-lg p-2 ${
                            isFewLeft
                                ? 'bg-orange-100 text-orange-600'
                                : 'bg-violet-100 text-violet-700 border border-violet-200'
                        }`}
                    >
                        <Calendar size={20} />
                    </div>
                    <span className={`text-[19px] font-black ${isFewLeft ? 'text-orange-900' : 'text-violet-900'}`}>
                        {headerDate}
                    </span>
                </div>

                <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 shadow-sm">
                    <Repeat size={14} />
                    往復セット
                </div>
            </div>

            <div className="flex flex-col gap-4 p-5">
                {/* 往路 */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-md bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white">①</span>
                        <span className="text-xs font-bold text-violet-700">往路</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                        <span className="text-base font-bold leading-tight text-slate-800">
                            {formatJobRoute(out)}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs font-bold text-slate-500">
                        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">
                            残り {out.remainingSlots} / {out.capacity} 枠
                        </span>
                        {!isLegApplyable(out) && (
                            <span className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                                {displayStatusLabel(out.displayStatus)}
                            </span>
                        )}
                    </div>
                </div>

                {/* 復路 */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-md bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white">②</span>
                        <span className="text-xs font-bold text-violet-700">復路</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                        <span className="text-base font-bold leading-tight text-slate-800">
                            {formatJobRoute(ret)}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs font-bold text-slate-500">
                        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">
                            残り {ret.remainingSlots} / {ret.capacity} 枠
                        </span>
                        {!isLegApplyable(ret) && (
                            <span className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                                {displayStatusLabel(ret.displayStatus)}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 text-sm font-bold text-slate-600">
                    <Clock size={18} className="shrink-0 text-slate-400" />
                    <span className="flex-1 text-slate-500">
                        締切：往路 {out.deadline} ／ 復路 {ret.deadline}
                    </span>
                </div>

                {(out.note || ret.note) && (
                    <div className="flex flex-col gap-2">
                        {out.note && (
                            <div className="flex gap-2.5 rounded-xl border border-amber-100 bg-amber-50 p-3">
                                <FileText size={16} className="mt-0.5 shrink-0 text-amber-600" />
                                <p className="m-0 whitespace-pre-wrap text-sm font-medium leading-relaxed text-amber-900">
                                    <span className="font-bold">往路：</span>
                                    {out.note}
                                </p>
                            </div>
                        )}
                        {ret.note && (
                            <div className="flex gap-2.5 rounded-xl border border-amber-100 bg-amber-50 p-3">
                                <FileText size={16} className="mt-0.5 shrink-0 text-amber-600" />
                                <p className="m-0 whitespace-pre-wrap text-sm font-medium leading-relaxed text-amber-900">
                                    <span className="font-bold">復路：</span>
                                    {ret.note}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {!card.canApplySet && card.disabledReason && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                        応募できません（{card.disabledReason}）
                    </div>
                )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50 p-4">
                <button
                    className={`group relative w-full overflow-hidden rounded-xl py-4 text-lg font-bold transition-all active:scale-[0.98] ${
                        isDisabled
                            ? 'cursor-not-allowed bg-slate-300 text-slate-600 shadow-none'
                            : 'bg-violet-600 text-white shadow-[0_4px_14px_0_rgba(139,92,246,0.39)] hover:bg-violet-700 hover:shadow-[0_6px_20px_rgba(139,92,246,0.23)]'
                    }`}
                    onClick={onApply}
                    disabled={isDisabled}
                >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        {isApplying ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                確定処理中...
                            </>
                        ) : !card.canApplySet ? (
                            '現在応募できません'
                        ) : (
                            <>
                                往復セットでまとめて応募する
                                <ChevronRight
                                    size={20}
                                    className="transition-transform group-hover:translate-x-1"
                                />
                            </>
                        )}
                    </span>
                </button>
            </div>
        </div>
    )
}