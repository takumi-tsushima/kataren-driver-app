import React from 'react'
import { format, addDays, startOfDay, isSameDay, differenceInDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CalendarDays, AlertCircle, ChevronRight, CheckCircle2, XCircle, Lock, UserCog } from 'lucide-react'
import type { ShiftAvailabilityData } from '../types/shift'
import './Home.css'

interface HomeProps {
    shifts: ShiftAvailabilityData[]
    isAdmin: boolean
    onNavigate: (page: 'home' | 'shift-submit' | 'admin-dashboard' | 'driver-jobs-list' | 'driver-my-jobs' | 'profile-edit') => void
    onEditDate: (date: Date) => void
}

export const Home: React.FC<HomeProps> = ({ shifts, isAdmin, onNavigate, onEditDate }) => {
    // Generate next 7 days
    const today = startOfDay(new Date())
    const next7Days = Array.from({ length: 7 }).map((_, i) => addDays(today, i))

    // Helper to get status of a specific day
    const getDayStatus = (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const shift = shifts.find(s => s.shift_date === dateStr)
        return shift ? shift.availability_status : 'none'
    }

    // 今日から3日後までロック（4日間）。5日目以降は編集可
    const isLockedDate = (date: Date) => {
        const diff = differenceInDays(startOfDay(date), today)
        return diff < 4
    }

    const unenteredCount = next7Days.filter(d => getDayStatus(d) === 'none').length

    const renderRowContent = (date: Date) => {
        const status = getDayStatus(date)
        const isTodayDate = isSameDay(date, today)
        const locked = isLockedDate(date)

        return (
            <>
                <div className="date-col">
                    {locked && <Lock size={12} className="row-lock-icon" />}
                    <span className="date-text">{format(date, 'M/d', { locale: ja })}</span>
                    <span className="day-text">({format(date, 'E', { locale: ja })})</span>
                    {isTodayDate && <span className="today-badge">今日</span>}
                </div>
                <div className="status-col">
                    {status === 'ok' && (
                        <div className="status-pill ok">
                            <CheckCircle2 size={14} />
                            <span>OK</span>
                        </div>
                    )}
                    {status === 'ng' && (
                        <div className="status-pill ng">
                            <XCircle size={14} />
                            <span>NG</span>
                        </div>
                    )}
                    {status === 'none' && (
                        <div className="status-pill none">
                            <span>未入力</span>
                        </div>
                    )}
                    {!locked && <ChevronRight size={16} className="row-edit-chevron" />}
                </div>
            </>
        )
    }

    return (
        <div className="home-container">
            {unenteredCount > 0 && (
                <div className="alert-card">
                    <AlertCircle size={20} className="alert-icon" />
                    <div className="alert-content">
                        <h3>未入力のシフトがあります</h3>
                        <p>直近7日間で {unenteredCount} 日分のシフトが未入力です。</p>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-header">
                    <div className="card-title">
                        <CalendarDays size={20} className="icon-purple" />
                        <h2>直近7日間のシフト</h2>
                    </div>
                </div>

                <div className="upcoming-list">
                    {next7Days.map(date => {
                        const locked = isLockedDate(date)

                        if (locked) {
                            return (
                                <div
                                    key={date.toISOString()}
                                    className="upcoming-item is-locked"
                                    aria-label={`${format(date, 'M月d日', { locale: ja })} は編集不可`}
                                >
                                    {renderRowContent(date)}
                                </div>
                            )
                        }

                        return (
                            <button
                                key={date.toISOString()}
                                type="button"
                                className="upcoming-item is-editable"
                                onClick={() => onEditDate(date)}
                                aria-label={`${format(date, 'M月d日', { locale: ja })} のシフトを編集`}
                            >
                                {renderRowContent(date)}
                            </button>
                        )
                    })}
                </div>

                <button className="primary-action-btn" onClick={() => onNavigate('shift-submit')}>
                    シフトを入力する
                    <ChevronRight size={18} />
                </button>
                <button
                    className="primary-action-btn"
                    onClick={() => onNavigate('driver-jobs-list')}
                    style={{ marginTop: '12px', background: '#3b82f6', color: '#ffffff' }}
                >
                    募集案件一覧を見る
                    <ChevronRight size={18} />
                </button>
                <button
                    className="primary-action-btn"
                    onClick={() => onNavigate('driver-my-jobs')}
                    style={{ marginTop: '12px', background: '#0d9488', color: '#ffffff' }}
                >
                    自分の案件一覧を見る
                    <ChevronRight size={18} />
                </button>
                <button
                    className="primary-action-btn"
                    onClick={() => onNavigate('profile-edit')}
                    style={{ marginTop: '12px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                >
                    <UserCog size={18} style={{ marginRight: 8 }} />
                    プロフィール編集
                    <ChevronRight size={18} />
                </button>

                {isAdmin && (
                    <button
                        className="primary-action-btn"
                        onClick={() => onNavigate('admin-dashboard')}
                        style={{ marginTop: '12px', background: '#0f172a', color: '#ffffff' }}
                    >
                        管理ダッシュボードを開く
                        <ChevronRight size={18} />
                    </button>
                )}
            </div>
        </div>
    )
}
