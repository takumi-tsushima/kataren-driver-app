import React, { useState, useMemo } from 'react'
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    startOfDay,
    differenceInDays
} from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Shift, ShiftStatus } from '../types/shift'
import { CalendarDayCell } from './CalendarDayCell'
import './ShiftCalendar.css'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ShiftCalendarProps {
    shifts: Map<string, Shift>
    selectedDates: Date[]
    onToggleDateSelection: (date: Date) => void
}

export const ShiftCalendar: React.FC<ShiftCalendarProps> = ({
    shifts,
    selectedDates,
    onToggleDateSelection,
}) => {
    const [currentMonth, setCurrentMonth] = useState(new Date())

    const onPrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
    const onNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))

    const today = startOfDay(new Date())

    const days = useMemo(() => {
        const monthStart = startOfMonth(currentMonth)
        const monthEnd = endOfMonth(monthStart)
        const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }) // Sunday start
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 })

        return eachDayOfInterval({ start: startDate, end: endDate })
    }, [currentMonth])

    const weekDays = ['日', '月', '火', '水', '木', '金', '土']

    const isLocked = (date: Date) => {
        // 過去日〜今日から3日後までロック（4日間）。例：今日5/1なら5/1〜5/4ロック、5/5以降編集可
        const diff = differenceInDays(date, today)
        return diff < 4
    }

    return (
        <div className="shift-calendar-container">
            <div className="calendar-header">
                <button className="nav-btn" onClick={onPrevMonth}>
                    <ChevronLeft />
                </button>
                <h2 className="month-title">
                    {format(currentMonth, 'yyyy年 M月', { locale: ja })}
                </h2>
                <button className="nav-btn" onClick={onNextMonth}>
                    <ChevronRight />
                </button>
            </div>

            <div className="calendar-grid">
                {weekDays.map((day, idx) => (
                    <div key={idx} className="weekday-header">
                        {day}
                    </div>
                ))}

                {days.map((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd')
                    const shift = shifts.get(dateStr)
                    const status: ShiftStatus = shift?.status || 'none'
                    const locked = isLocked(day)
                    const selected = selectedDates.some((d) => isSameDay(d, day))

                    return (
                        <div
                            key={day.toISOString()}
                            className={`cell-wrapper ${!isSameMonth(day, currentMonth) ? 'diff-month' : ''}`}
                        >
                            <CalendarDayCell
                                date={day}
                                status={status}
                                isLocked={locked}
                                isSelected={selected}
                                onClick={() => onToggleDateSelection(day)}
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
