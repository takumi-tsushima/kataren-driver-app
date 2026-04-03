import React from 'react'
import { isToday, format } from 'date-fns'
import type { ShiftStatus } from '../types/shift'
import { Lock } from 'lucide-react'

interface CalendarDayCellProps {
    date: Date
    status: ShiftStatus
    isLocked: boolean
    isSelected: boolean
    onClick: () => void
}

export const CalendarDayCell: React.FC<CalendarDayCellProps> = ({
    date,
    status,
    isLocked,
    isSelected,
    onClick,
}) => {
    const dayName = format(date, 'd')
    const isCurrentDay = isToday(date)

    let statusClass = 'status-none'
    if (status === 'ok') statusClass = 'status-ok'
    if (status === 'ng') statusClass = 'status-ng'

    const isEntered = status !== 'none'

    const cellClassNames = [
        'calendar-cell',
        statusClass,
        isLocked ? 'is-locked' : '',
        isSelected ? 'is-selected' : '',
        isCurrentDay ? 'is-today' : '',
        isEntered ? 'is-entered' : ''
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <button
            type="button"
            className={cellClassNames}
            onClick={onClick}
            disabled={isLocked}
            aria-label={`${format(date, 'yyyy年M月d日')} ${status}`}
            aria-pressed={isSelected}
        >
            <div className="cell-header">
                <span className="day-number">{dayName}</span>
                {isLocked && <Lock className="lock-icon" size={12} />}
            </div>

            <div className="cell-body">
                {status === 'ok' && <div className="status-dot ok" />}
                {status === 'ng' && <div className="status-dot ng" />}
            </div>

            {isSelected && (
                <div className="selection-indicator" />
            )}
        </button>
    )
}
