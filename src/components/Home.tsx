import React from 'react'
import { format, addDays, startOfDay, isSameDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CalendarDays, AlertCircle, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import type { ShiftAvailabilityData } from '../types/shift'
import './Home.css'

interface HomeProps {
    shifts: ShiftAvailabilityData[]
    onNavigate: (page: 'home' | 'shift-submit' | 'admin-shift-table' | 'admin-job-create' | 'admin-draft-jobs' | 'driver-jobs-list') => void
}

export const Home: React.FC<HomeProps> = ({ shifts, onNavigate }) => {
    // Generate next 7 days
    const today = startOfDay(new Date())
    const next7Days = Array.from({ length: 7 }).map((_, i) => addDays(today, i))

    // Helper to get status of a specific day
    const getDayStatus = (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const shift = shifts.find(s => s.shift_date === dateStr)
        return shift ? shift.availability_status : 'none'
    }

    const unenteredCount = next7Days.filter(d => getDayStatus(d) === 'none').length

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
                        const status = getDayStatus(date)
                        const isTodayDate = isSameDay(date, today)

                        return (
                            <div key={date.toISOString()} className="upcoming-item">
                                <div className="date-col">
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
                                </div>
                            </div>
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

                <div style={{ marginTop: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                        style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer' }}
                        onClick={() => onNavigate('admin-shift-table')}
                    >
                        管理者向けシフト俯瞰画面をプレビュー
                    </button>
                    <button
                        style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer' }}
                        onClick={() => onNavigate('admin-job-create')}
                    >
                        管理者向け案件作成画面をプレビュー
                    </button>
                    <button
                        style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer' }}
                        onClick={() => onNavigate('admin-draft-jobs')}
                    >
                        管理者向け下書き案件一覧画面をプレビュー
                    </button>
                </div>
            </div>
        </div>
    )
}
