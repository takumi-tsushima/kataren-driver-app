import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
    ArrowLeft,
    CalendarDays,
    ChevronDown,
    ChevronUp,
    MapPin,
    RefreshCw,
    Users,
} from 'lucide-react'

type JobRow = {
    id: string
    work_date?: string | null
    date?: string | null
    job_date?: string | null
    capacity?: number | null
    required_people?: number | null
    headcount?: number | null
    deadline_at?: string | null
    deadline_date?: string | null
    status?: string | null
    shop_name?: string | null
    store_name?: string | null
    location_name?: string | null
    location?: string | null
    store?: string | null
    [key: string]: unknown
}

type ApplicationRow = {
    id: string
    job_id?: string
    recruitment_job_id?: string
    driver_id?: string
    applicant_driver_id?: string
    created_at?: string | null
    applied_at?: string | null
    confirmed_at?: string | null
    [key: string]: unknown
}

type DriverRow = {
    id: string
    email?: string | null
    name?: string | null
    full_name?: string | null
    display_name?: string | null
    nickname?: string | null
    [key: string]: unknown
}

type ConfirmedDriver = {
    id: string
    driverId: string
    name: string
    email: string
    confirmedAt: string | null
}

type ConfirmedJob = {
    id: string
    workDate: string | null
    shopName: string
    capacity: number
    confirmedCount: number
    remainingCount: number
    deadlineAt: string | null
    status: string
    confirmedDrivers: ConfirmedDriver[]
}

interface AdminConfirmedJobsListProps {
    onBack: () => void
}

function formatDate(value: string | null) {
    if (!value) return '日付未設定'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date)
}

function formatDateTime(value: string | null) {
    if (!value) return '—'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date)
}

function getStatusLabel(status: string) {
    switch (status) {
        case 'open':
            return '募集中'
        case 'closed':
            return '募集終了'
        case 'stopped':
            return '停止中'
        case 'draft':
            return '下書き'
        default:
            return status || '不明'
    }
}

function getStatusClasses(status: string) {
    switch (status) {
        case 'open':
            return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
        case 'closed':
            return 'bg-slate-100 text-slate-700 border border-slate-200'
        case 'stopped':
            return 'bg-amber-100 text-amber-700 border border-amber-200'
        case 'draft':
            return 'bg-slate-100 text-slate-700 border border-slate-200'
        default:
            return 'bg-slate-100 text-slate-700 border border-slate-200'
    }
}

function getDriverName(driver: DriverRow | undefined) {
    if (!driver) return '名前未設定'
    return (
        driver.name ||
        driver.full_name ||
        driver.display_name ||
        driver.nickname ||
        '名前未設定'
    )
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message

    if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
    ) {
        return (error as { message: string }).message
    }

    try {
        return JSON.stringify(error)
    } catch {
        return '不明なエラー'
    }
}

function getJobWorkDate(job: JobRow): string | null {
    return job.work_date || job.date || job.job_date || null
}

function getJobCapacity(job: JobRow): number {
    const raw = job.capacity ?? job.required_people ?? job.headcount ?? 0
    const num = Number(raw)
    return Number.isNaN(num) ? 0 : num
}

function getJobDeadline(job: JobRow): string | null {
    return job.deadline_at || job.deadline_date || null
}

function getJobShopName(job: JobRow): string {
    return (
        job.shop_name ||
        job.store_name ||
        job.location_name ||
        job.location ||
        job.store ||
        '店舗未設定'
    )
}

function getApplicationJobId(app: ApplicationRow): string {
    return app.job_id || app.recruitment_job_id || ''
}

function getApplicationDriverId(app: ApplicationRow): string {
    return app.driver_id || app.applicant_driver_id || ''
}

function getApplicationConfirmedAt(app: ApplicationRow): string | null {
    return app.confirmed_at || app.applied_at || app.created_at || null
}

export const AdminConfirmedJobsList: React.FC<AdminConfirmedJobsListProps> = ({
    onBack,
}) => {
    const [jobs, setJobs] = useState<ConfirmedJob[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedJobIds, setExpandedJobIds] = useState<string[]>([])

    const fetchConfirmedJobs = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            // 1. 案件取得
            const { data: jobsData, error: jobsError } = await supabase
                .from('jobs')
                .select('*')
                .order('created_at', { ascending: false })

            if (jobsError) {
                throw new Error(`jobs 取得失敗: ${jobsError.message}`)
            }

            const jobsRows = (jobsData ?? []) as JobRow[]

            // 2. 応募取得
            const { data: applicationsData, error: applicationsError } = await supabase
                .from('job_applications')
                .select('*')

            if (applicationsError) {
                throw new Error(
                    `job_applications 取得失敗: ${applicationsError.message}`
                )
            }

            const applicationRows = (applicationsData ?? []) as ApplicationRow[]

            const jobIdsWithApplications = Array.from(
                new Set(
                    applicationRows
                        .map((row) => getApplicationJobId(row))
                        .filter((id) => Boolean(id))
                )
            )

            if (jobIdsWithApplications.length === 0) {
                setJobs([])
                return
            }

            // 3. ドライバー取得
            const driverIds = Array.from(
                new Set(
                    applicationRows
                        .map((row) => getApplicationDriverId(row))
                        .filter((id) => Boolean(id))
                )
            )

            let driverMap = new Map<string, DriverRow>()

            if (driverIds.length > 0) {
                const { data: driversData, error: driversError } = await supabase
                    .from('drivers')
                    .select('*')
                    .in('id', driverIds)

                if (driversError) {
                    throw new Error(`drivers 取得失敗: ${driversError.message}`)
                }

                const driverRows = (driversData ?? []) as DriverRow[]
                driverMap = new Map(driverRows.map((row) => [row.id, row]))
            }

            // 4. job_idごとに応募をまとめる
            const applicationsByJobId = new Map<string, ApplicationRow[]>()

            for (const app of applicationRows) {
                const jobId = getApplicationJobId(app)
                if (!jobId) continue

                const current = applicationsByJobId.get(jobId) ?? []
                current.push(app)
                applicationsByJobId.set(jobId, current)
            }

            // 5. 画面用データへ変換
            const normalizedJobs: ConfirmedJob[] = jobsRows
                .filter((job) => jobIdsWithApplications.includes(job.id))
                .map((job) => {
                    const applications = applicationsByJobId.get(job.id) ?? []

                    const confirmedDrivers: ConfirmedDriver[] = applications.map((app) => {
                        const driverId = getApplicationDriverId(app)
                        const driver = driverMap.get(driverId)

                        return {
                            id: String(app.id),
                            driverId,
                            name: getDriverName(driver),
                            email: driver?.email ?? '',
                            confirmedAt: getApplicationConfirmedAt(app),
                        }
                    })

                    const capacity = getJobCapacity(job)
                    const confirmedCount = confirmedDrivers.length

                    return {
                        id: job.id,
                        workDate: getJobWorkDate(job),
                        shopName: getJobShopName(job),
                        capacity,
                        confirmedCount,
                        remainingCount: Math.max(capacity - confirmedCount, 0),
                        deadlineAt: getJobDeadline(job),
                        status: job.status || 'unknown',
                        confirmedDrivers,
                    }
                })
                .filter((job) => job.confirmedCount > 0)

            setJobs(normalizedJobs)
        } catch (err) {
            console.error('Failed to fetch confirmed jobs:', err)
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchConfirmedJobs()
    }, [fetchConfirmedJobs])

    const toggleExpanded = (jobId: string) => {
        setExpandedJobIds((prev) =>
            prev.includes(jobId)
                ? prev.filter((id) => id !== jobId)
                : [...prev, jobId]
        )
    }

    const totalConfirmedCount = useMemo(() => {
        return jobs.reduce((sum, job) => sum + job.confirmedCount, 0)
    }, [jobs])

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto max-w-7xl">
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-6 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                >
                    <ArrowLeft size={20} />
                    戻る
                </button>

                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                            確定案件一覧
                        </h1>
                        <p className="mt-2 text-base text-slate-600">
                            確定者がいる案件を一覧で確認できます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={fetchConfirmedJobs}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                    >
                        <RefreshCw size={18} />
                        再読み込み
                    </button>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">確定案件数</p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">{jobs.length}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">確定ドライバー総数</p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                            {totalConfirmedCount}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">表示条件</p>
                        <p className="mt-2 text-base font-semibold text-slate-900">
                            確定者が1名以上いる案件のみ
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-base font-medium text-slate-500 shadow-sm">
                        読み込み中...
                    </div>
                ) : error ? (
                    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
                        <p className="text-base font-semibold text-rose-700">
                            確定案件一覧の取得に失敗しました。
                        </p>
                        <p className="mt-2 break-all text-sm text-rose-700/90">{error}</p>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                        <p className="text-lg font-bold text-slate-900">
                            確定案件はまだありません
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                            応募確定した案件があるとここに表示されます。
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {jobs.map((job) => {
                            const isExpanded = expandedJobIds.includes(job.id)
                            const fillRate =
                                job.capacity > 0
                                    ? Math.min((job.confirmedCount / job.capacity) * 100, 100)
                                    : 0

                            return (
                                <div
                                    key={job.id}
                                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
                                >
                                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <p className="text-2xl font-bold text-slate-900">
                                                {formatDate(job.workDate)}
                                            </p>
                                            <div className="mt-2 flex items-center gap-2 text-slate-600">
                                                <MapPin size={16} />
                                                <span className="text-base font-medium">
                                                    {job.shopName}
                                                </span>
                                            </div>
                                        </div>

                                        <span
                                            className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-semibold ${getStatusClasses(
                                                job.status
                                            )}`}
                                        >
                                            {getStatusLabel(job.status)}
                                        </span>
                                    </div>

                                    <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                                        <div className="flex items-end justify-between gap-4">
                                            <div className="flex items-end gap-2">
                                                <p className="text-base font-semibold text-slate-600">
                                                    確定
                                                </p>
                                                <p className="text-4xl font-bold leading-none text-slate-900">
                                                    {job.confirmedCount}
                                                </p>
                                                <p className="pb-1 text-lg font-semibold text-slate-600">
                                                    / {job.capacity}人
                                                </p>
                                            </div>

                                            <p className="text-lg font-bold text-indigo-600">
                                                残り {job.remainingCount}枠
                                            </p>
                                        </div>

                                        <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-200">
                                            <div
                                                className="h-full rounded-full bg-slate-600 transition-all"
                                                style={{ width: `${fillRate}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-3">
                                        <div className="rounded-xl bg-slate-50 p-3">
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <Users size={16} />
                                                <p className="text-xs font-medium">募集人数</p>
                                            </div>
                                            <p className="mt-2 text-lg font-bold text-slate-900">
                                                {job.capacity}人
                                            </p>
                                        </div>

                                        <div className="rounded-xl bg-slate-50 p-3">
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <Users size={16} />
                                                <p className="text-xs font-medium">確定人数</p>
                                            </div>
                                            <p className="mt-2 text-lg font-bold text-slate-900">
                                                {job.confirmedCount}人
                                            </p>
                                        </div>

                                        <div className="rounded-xl bg-slate-50 p-3">
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <CalendarDays size={16} />
                                                <p className="text-xs font-medium">締切日時</p>
                                            </div>
                                            <p className="mt-2 text-lg font-bold text-slate-900">
                                                {formatDateTime(job.deadlineAt)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-5">
                                        <button
                                            type="button"
                                            onClick={() => toggleExpanded(job.id)}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-800 transition hover:bg-slate-100 md:w-auto"
                                        >
                                            {isExpanded ? (
                                                <>
                                                    <ChevronUp size={18} />
                                                    確定ドライバーを閉じる
                                                </>
                                            ) : (
                                                <>
                                                    <ChevronDown size={18} />
                                                    確定ドライバーを見る
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <h3 className="text-base font-bold text-slate-900">
                                                    確定ドライバー一覧
                                                </h3>
                                                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                                                    {job.confirmedDrivers.length}名
                                                </span>
                                            </div>

                                            {job.confirmedDrivers.length === 0 ? (
                                                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                                                    確定ドライバーはいません
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {job.confirmedDrivers.map((driver, index) => (
                                                        <div
                                                            key={driver.id}
                                                            className="rounded-xl border border-slate-200 bg-white p-4"
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                                                                            {index + 1}
                                                                        </span>
                                                                        <p className="truncate text-base font-bold text-slate-900">
                                                                            {driver.name || '名前未設定'}
                                                                        </p>
                                                                    </div>

                                                                    <p className="mt-2 break-all text-sm text-slate-600">
                                                                        {driver.email || 'メール未設定'}
                                                                    </p>
                                                                </div>

                                                                <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                                                    確定
                                                                </span>
                                                            </div>

                                                            <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-2">
                                                                <div>
                                                                    <p className="text-xs font-medium text-slate-500">
                                                                        確定日時
                                                                    </p>
                                                                    <p className="mt-1 text-sm font-semibold text-slate-800">
                                                                        {formatDateTime(driver.confirmedAt)}
                                                                    </p>
                                                                </div>

                                                                <div>
                                                                    <p className="text-xs font-medium text-slate-500">
                                                                        ドライバーID
                                                                    </p>
                                                                    <p className="mt-1 break-all text-sm font-semibold text-slate-800">
                                                                        {driver.driverId}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}