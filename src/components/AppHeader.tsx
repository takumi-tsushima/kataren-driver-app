import React from 'react'

interface AppHeaderProps {
    title?: string
    onBack?: () => void
    backLabel?: string
    userLabel?: string | null
    onLogout?: () => void
    className?: string
}

export const AppHeader: React.FC<AppHeaderProps> = ({
    title,
    onBack,
    backLabel = '← ホーム',
    userLabel,
    onLogout,
    className,
}) => {
    return (
        <header
            className={
                'mb-1 flex flex-nowrap items-center justify-between gap-2 ' +
                (className ?? '')
            }
        >
            <div className="flex min-w-0 items-center gap-1.5">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100"
                    >
                        {backLabel}
                    </button>
                )}
                {title && (
                    <h1 className="m-0 min-w-0 truncate text-base font-bold text-slate-900">
                        {title}
                    </h1>
                )}
            </div>

            {(userLabel || onLogout) && (
                <div className="flex min-w-0 shrink-0 items-center gap-1.5">
                    {userLabel && (
                        <span className="max-w-[80px] truncate text-[11px] text-slate-500">
                            {userLabel}
                        </span>
                    )}
                    {onLogout && (
                        <button
                            type="button"
                            onClick={onLogout}
                            className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100"
                        >
                            ログアウト
                        </button>
                    )}
                </div>
            )}
        </header>
    )
}
