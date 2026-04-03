import React, { useState, useEffect } from 'react'
import type { ShiftStatus } from '../types/shift'
import './ShiftEditModal.css'
import { X, Check, CheckCircle } from 'lucide-react'

interface ShiftEditModalProps {
    isOpen: boolean
    selectedCount: number
    onClose: () => void
    onApply: (data: {
        status: ShiftStatus
        timeSlot?: string
        maxJobs?: number
        note?: string
    }) => void
}

export const ShiftEditModal: React.FC<ShiftEditModalProps> = ({
    isOpen,
    selectedCount,
    onClose,
    onApply,
}) => {
    const [status, setStatus] = useState<ShiftStatus>('none')
    const [timeSlot, setTimeSlot] = useState('')
    const [maxJobs, setMaxJobs] = useState<number | ''>('')
    const [note, setNote] = useState('')
    const [isApplied, setIsApplied] = useState(false)

    const isOkStatus = status === 'ok' // Only show details if ok

    // Reset form when opened for new selection
    useEffect(() => {
        if (isOpen) {
            setStatus('none')
            setTimeSlot('')
            setMaxJobs('')
            setNote('')
            setIsApplied(false)
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleApply = () => {
        setIsApplied(true)
        onApply({
            status,
            timeSlot: timeSlot || undefined,
            maxJobs: maxJobs === '' ? undefined : Number(maxJobs),
            note: note || undefined,
        })

        setTimeout(() => {
            onClose()
            setTimeout(() => setIsApplied(false), 300) // reset after hidden
        }, 700)
    }

    return (
        <>
            <div className={`modal-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>
            <div className={`bottom-sheet ${isOpen ? 'open' : ''}`}>
                <div className="sheet-header">
                    <div className="sheet-title-area">
                        <h3>一括編集</h3>
                        <span className="selected-count-badge">{selectedCount}日を選択中</span>
                    </div>
                    <button className="close-btn" onClick={onClose} disabled={isApplied}>
                        <X size={20} />
                    </button>
                </div>

                <div className="sheet-body">
                    <div className="form-group">
                        <label>稼働可否</label>
                        <div className="status-toggle">
                            <button
                                className={`status-btn ok ${status === 'ok' ? 'active' : ''}`}
                                onClick={() => setStatus('ok')}
                                disabled={isApplied}
                            >
                                OK
                            </button>
                            <button
                                className={`status-btn ng ${status === 'ng' ? 'active' : ''}`}
                                onClick={() => setStatus('ng')}
                                disabled={isApplied}
                            >
                                NG
                            </button>
                            <button
                                className={`status-btn none ${status === 'none' ? 'active' : ''}`}
                                onClick={() => setStatus('none')}
                                disabled={isApplied}
                            >
                                クリア
                            </button>
                        </div>
                    </div>

                    {isOkStatus && (
                        <>
                            <div className="form-group row">
                                <div className="flex-1">
                                    <label>稼働可能な時間帯</label>
                                    <div className="quick-chip-group">
                                        <button
                                            className={`quick-chip ${timeSlot === '終日可能' ? 'active' : ''}`}
                                            onClick={() => setTimeSlot('終日可能')}
                                        >終日</button>
                                        <button
                                            className={`quick-chip ${timeSlot === '9:00-12:00' ? 'active' : ''}`}
                                            onClick={() => setTimeSlot('9:00-12:00')}
                                        >午前</button>
                                        <button
                                            className={`quick-chip ${timeSlot === '13:00-16:00' ? 'active' : ''}`}
                                            onClick={() => setTimeSlot('13:00-16:00')}
                                        >午後</button>
                                    </div>
                                    <select
                                        className="input-field select-field"
                                        value={timeSlot}
                                        onChange={(e) => setTimeSlot(e.target.value)}
                                        disabled={isApplied}
                                    >
                                        <option value="">指定なし</option>
                                        <option value="終日可能">終日可能</option>
                                        <option value="9:00-12:00">9:00-12:00</option>
                                        <option value="10:00-13:00">10:00-13:00</option>
                                        <option value="11:00-14:00">11:00-14:00</option>
                                        <option value="12:00-15:00">12:00-15:00</option>
                                        <option value="13:00-16:00">13:00-16:00</option>
                                        <option value="14:00-17:00">14:00-17:00</option>
                                        <option value="15:00-18:00">15:00-18:00</option>
                                        <option value="16:00-19:00">16:00-19:00</option>
                                        <option value="17:00-20:00">17:00-20:00</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label>最大本数 (任意)</label>
                                    <select
                                        className="input-field select-field"
                                        value={maxJobs}
                                        onChange={(e) => setMaxJobs(e.target.value === '' ? '' : Number(e.target.value))}
                                        disabled={isApplied}
                                    >
                                        <option value="">指定なし</option>
                                        <option value="1">1本</option>
                                        <option value="2">2本</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>備考 (任意)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="例: 午前中のみ可能"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    disabled={isApplied}
                                />
                            </div>
                        </>
                    )}

                    <button className={`apply-btn ${isApplied ? 'success' : ''}`} onClick={handleApply} disabled={isApplied}>
                        {isApplied ? (
                            <><CheckCircle size={18} /> 反映しました！</>
                        ) : (
                            <><Check size={18} /> {selectedCount}日分に適用する</>
                        )}
                    </button>
                </div>
            </div>
        </>
    )
}
