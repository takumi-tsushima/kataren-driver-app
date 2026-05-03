import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Calendar, MapPin, Users, Clock, FileText, Save, ChevronLeft, Repeat, ArrowRight } from 'lucide-react'
import { AREA_TAG_LABELS, type AreaTag } from '../lib/jobLocation'

type Props = {
    jobId: string
    onBack: () => void
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
    status: 'draft' | 'open' | 'closed' | 'cancelled'
}

const STORE_OPTIONS = [
    'トヨタレンタカー赤羽駅前店',
    'トヨタレンタカー練馬駅前店',
    'トヨタレンタカー中野坂上店',
    'トヨタレンタカー吾妻橋店',
    'トヨタレンタカー池袋東口店',
    'トヨタレンタカー東京駅八重洲口店',
    'トヨタレンタカー成田空港店',
] as const

const AREA_TAG_OPTIONS: { value: AreaTag; label: string }[] = [
    { value: 'tokyo_to_narita', label: AREA_TAG_LABELS.tokyo_to_narita },
    { value: 'narita_to_tokyo', label: AREA_TAG_LABELS.narita_to_tokyo },
    { value: 'tokyo_to_nagoya', label: AREA_TAG_LABELS.tokyo_to_nagoya },
    { value: 'nagoya_to_tokyo', label: AREA_TAG_LABELS.nagoya_to_tokyo },
    { value: 'round_trip', label: AREA_TAG_LABELS.round_trip },
]

export const AdminDraftJobEdit = ({ jobId, onBack }: Props) => {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

    const [workDate, setWorkDate] = useState('')
    const [areaTag, setAreaTag] = useState<string>('')
    const [pickupLocation, setPickupLocation] = useState('')
    const [dropoffLocation, setDropoffLocation] = useState('')
    const [legacyLocation, setLegacyLocation] = useState('')
    const [groupId, setGroupId] = useState<string | null>(null)
    const [capacity, setCapacity] = useState(1)
    const [deadline, setDeadline] = useState('')
    const [note, setNote] = useState('')

    useEffect(() => {
        const fetchJob = async () => {
            setLoading(true)
            setMessage('')
            setMessageType('')

            try {
                const { data, error } = await supabase
                    .from('jobs')
                    .select('id, work_date, location, pickup_location, dropoff_location, area_tag, group_id, capacity, application_deadline, note, status')
                    .eq('id', jobId)
                    .eq('status', 'draft')
                    .single()

                if (error) throw error

                const job = data as JobRow

                setWorkDate(job.work_date ?? '')
                setAreaTag(job.area_tag ?? '')
                setPickupLocation(job.pickup_location ?? '')
                setDropoffLocation(job.dropoff_location ?? '')
                setLegacyLocation(job.location ?? '')
                setGroupId(job.group_id ?? null)
                setCapacity(job.capacity ?? 1)
                setDeadline(job.application_deadline ?? '')
                setNote(job.note ?? '')
            } catch (e) {
                console.error(e)
                setMessage('下書き案件の取得に失敗しました。')
                setMessageType('error')
            } finally {
                setLoading(false)
            }
        }

        fetchJob()
    }, [jobId])

    const isValid = useMemo(() => {
        if (workDate.trim() === '') return false
        if (Number(capacity) < 1) return false
        const hasNew = pickupLocation.trim() && dropoffLocation.trim() && areaTag
        const hasLegacy = legacyLocation.trim()
        return Boolean(hasNew || hasLegacy)
    }, [workDate, capacity, pickupLocation, dropoffLocation, areaTag, legacyLocation])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!isValid) {
            setMessage('日付・場所・定員を正しく入力してください。')
            setMessageType('error')
            return
        }

        setSaving(true)
        setMessage('')
        setMessageType('')

        try {
            const { error } = await supabase
                .from('jobs')
                .update({
                    work_date: workDate,
                    area_tag: areaTag ? areaTag : null,
                    pickup_location: pickupLocation.trim() ? pickupLocation.trim() : null,
                    dropoff_location: dropoffLocation.trim() ? dropoffLocation.trim() : null,
                    location: legacyLocation.trim() ? legacyLocation.trim() : null,
                    capacity: Math.max(1, Number(capacity)),
                    application_deadline: deadline.trim() ? deadline : null,
                    note: note.trim() ? note.trim() : null,
                    status: 'draft',
                })
                .eq('id', jobId)

            if (error) throw error

            setMessage('下書きを保存しました。')
            setMessageType('success')

            setTimeout(() => {
                onBack()
            }, 500)
        } catch (e) {
            console.error(e)
            setMessage('保存に失敗しました。')
            setMessageType('error')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="w-full">
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
                    <h2 className="m-0 text-2xl font-bold text-slate-900">下書き案件編集</h2>
                    <p className="mt-1.5 text-slate-600 text-sm">下書き状態の案件を編集できます。</p>
                    {groupId && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700 border border-violet-200">
                            <Repeat size={12} />
                            往復セット（group_id: {groupId.slice(0, 8)}…）
                            <span className="ml-1 font-normal text-violet-600">復路は別レコードとして編集してください</span>
                        </div>
                    )}
                </div>

                <button
                    className="border border-slate-300 bg-white text-slate-700 rounded-xl px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors"
                    onClick={onBack}
                >
                    <ChevronLeft size={18} />
                    一覧へ戻る
                </button>
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

            <div className="bg-white border border-slate-200 rounded-[18px] p-5 shadow-sm">
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-1.5 font-bold text-slate-700 text-sm">
                                <Calendar size={16} />
                                稼働日
                            </label>
                            <input
                                className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white"
                                type="date"
                                value={workDate}
                                onChange={(e) => setWorkDate(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-1.5 font-bold text-slate-700 text-sm">
                                <Repeat size={16} />
                                案件種別
                            </label>
                            <select
                                className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white"
                                value={areaTag}
                                onChange={(e) => setAreaTag(e.target.value)}
                            >
                                <option value="">未設定</option>
                                {AREA_TAG_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-1.5 font-bold text-slate-700 text-sm">
                            <MapPin size={16} />
                            区間
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                            <select
                                className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white"
                                value={pickupLocation}
                                onChange={(e) => setPickupLocation(e.target.value)}
                            >
                                <option value="">未設定</option>
                                {STORE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                {pickupLocation && !(STORE_OPTIONS as readonly string[]).includes(pickupLocation) && (
                                    <option value={pickupLocation}>{pickupLocation}（既存値）</option>
                                )}
                            </select>
                            <ArrowRight size={20} className="text-slate-400 mx-auto hidden md:block" />
                            <select
                                className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white"
                                value={dropoffLocation}
                                onChange={(e) => setDropoffLocation(e.target.value)}
                            >
                                <option value="">未設定</option>
                                {STORE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                {dropoffLocation && !(STORE_OPTIONS as readonly string[]).includes(dropoffLocation) && (
                                    <option value={dropoffLocation}>{dropoffLocation}（既存値）</option>
                                )}
                            </select>
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-500">
                                互換用：従来の場所テキスト（出発店舗フォールバック）
                            </label>
                            <input
                                className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white"
                                type="text"
                                value={legacyLocation}
                                onChange={(e) => setLegacyLocation(e.target.value)}
                                placeholder="例: 渋谷本店（既存案件用）"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-1.5 font-bold text-slate-700 text-sm">
                                <Users size={16} />
                                定員
                            </label>
                            <input
                                className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white"
                                type="number"
                                min={1}
                                value={capacity}
                                onChange={(e) => setCapacity(Number(e.target.value))}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-1.5 font-bold text-slate-700 text-sm">
                                <Clock size={16} />
                                締切
                            </label>
                            <input
                                className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white"
                                type="datetime-local"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-1.5 font-bold text-slate-700 text-sm">
                            <FileText size={16} />
                            備考
                        </label>
                        <textarea
                            className="w-full box-border border border-slate-300 rounded-xl p-3 text-sm bg-white min-h-[120px]"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="必要なら入力"
                        />
                    </div>

                    <div className="pt-2 flex gap-3 flex-col sm:flex-row">
                        <button
                            type="button"
                            className="flex-1 border border-slate-300 bg-white text-slate-700 rounded-xl py-3.5 font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
                            onClick={onBack}
                            disabled={saving}
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            className="flex-1 bg-slate-900 text-white rounded-xl py-3.5 font-bold flex justify-center items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                            disabled={saving}
                        >
                            <Save size={18} />
                            {saving ? '保存中...' : '保存'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
