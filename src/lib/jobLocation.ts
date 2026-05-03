// 案件のルート表示・エリアタグ表示ヘルパ
// 既存案件（pickup/dropoff/area_tag が NULL）は legacy location にフォールバック

export type JobLocationFields = {
    location?: string | null
    pickup_location?: string | null
    dropoff_location?: string | null
    area_tag?: string | null
    group_id?: string | null
}

export const AREA_TAG_VALUES = [
    'round_trip',
    'tokyo_to_narita',
    'narita_to_tokyo',
    'tokyo_to_nagoya',
    'nagoya_to_tokyo',
] as const

export type AreaTag = (typeof AREA_TAG_VALUES)[number]

export const AREA_TAG_LABELS: Record<AreaTag, string> = {
    round_trip: '往復',
    tokyo_to_narita: '東京→成田',
    narita_to_tokyo: '成田→東京',
    tokyo_to_nagoya: '東京→名古屋',
    nagoya_to_tokyo: '名古屋→東京',
}

// 表示用：出発 → 到着、未設定なら legacy location 文字列にフォールバック
export const formatJobRoute = (job: JobLocationFields): string => {
    const pickup = job.pickup_location?.trim()
    const dropoff = job.dropoff_location?.trim()
    if (pickup && dropoff) return `${pickup} → ${dropoff}`
    if (pickup) return pickup
    if (dropoff) return dropoff
    return job.location ?? ''
}

export const isRoundTrip = (job: JobLocationFields): boolean =>
    job.area_tag === 'round_trip'

export const getAreaTagLabel = (tag: string | null | undefined): string | null => {
    if (!tag) return null
    if ((AREA_TAG_VALUES as readonly string[]).includes(tag)) {
        return AREA_TAG_LABELS[tag as AreaTag]
    }
    return null
}
