import React from 'react'
import { Edit2 } from 'lucide-react'
import './SelectionBar.css'

interface SelectionBarProps {
    selectedCount: number
    onEdit: () => void
    onClear: () => void
}

export const SelectionBar: React.FC<SelectionBarProps> = ({
    selectedCount,
    onEdit,
    onClear,
}) => {
    const isVisible = selectedCount > 0

    return (
        <div className={`selection-bar ${isVisible ? 'visible' : ''}`}>
            <div className="selection-bar-content">
                <div className="selection-info">
                    <span className="count-badge">{selectedCount}</span>
                    <span className="count-label">日を選択中</span>
                </div>
                <div className="selection-actions">
                    <button className="clear-btn" onClick={onClear}>
                        解除
                    </button>
                    <button className="edit-btn" onClick={onEdit}>
                        <Edit2 size={16} />
                        一括編集
                    </button>
                </div>
            </div>
        </div>
    )
}
