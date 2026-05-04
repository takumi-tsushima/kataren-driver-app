import React, { useState, useEffect } from 'react'
import type { ShiftStatus } from '../types/shift'
import './ShiftEditModal.css'
import { X, Check, CheckCircle } from 'lucide-react'

interface ShiftEditModalProps {
    isOpen: boolean
    selectedCount: number
    onClose: () => void
    onApply: (data: { status: ShiftStatus }) => void
}

export const ShiftEditModal: React.FC<ShiftEditModalProps> = ({
    isOpen,
    selectedCount,
    onClose,
    onApply,
}) => {
    const [status, setStatus] = useState<ShiftStatus>('none')
    const [isApplied, setIsApplied] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setStatus('none')
            setIsApplied(false)
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleApply = () => {
        setIsApplied(true)
        onApply({ status })

        setTimeout(() => {
            onClose()
            setTimeout(() => setIsApplied(false), 300)
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
