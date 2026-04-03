import React from 'react'
import { Save } from 'lucide-react'
import './BulkEditBar.css'

interface BulkEditBarProps {
    onSave: () => void
    hasChanges: boolean
    changesCount: number
    isSaving?: boolean
}

export const BulkEditBar: React.FC<BulkEditBarProps> = ({
    onSave,
    hasChanges,
    changesCount,
    isSaving = false,
}) => {
    return (
        <div className={`bulk-edit-bar ${hasChanges ? 'visible' : ''}`}>
            <button
                className={`save-all-btn ${hasChanges ? 'has-changes' : ''}`}
                onClick={onSave}
                disabled={!hasChanges || isSaving}
            >
                <Save size={20} className={isSaving ? 'spin' : ''} />
                {isSaving ? '保存中...' : `変更を保存（${changesCount}件）`}
            </button>
        </div>
    )
}
