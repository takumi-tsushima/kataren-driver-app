export type ShiftStatus = 'ok' | 'ng' | 'none'

export type Shift = {
    date: string // YYYY-MM-DD
    status: ShiftStatus
}

export type ShiftAvailabilityData = {
    id: string
    shift_date: string
    availability_status: 'ok' | 'ng'
    available_from_time: string | null
    max_jobs_per_day: 0 | 1 | 2
    note: string | null
}
