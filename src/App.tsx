import { useEffect, useRef, useState, useMemo, type CSSProperties } from 'react'
import { supabase } from './lib/supabase'
import {
  format,
  isSameDay,
  startOfDay,
  differenceInDays,
  parseISO,
} from 'date-fns'
import './App.css'
import type { Shift, ShiftStatus } from './types/shift'
import { ShiftCalendar } from './components/ShiftCalendar'
import { ShiftEditModal } from './components/ShiftEditModal'
import { BulkEditBar } from './components/BulkEditBar'
import { SelectionBar } from './components/SelectionBar'
import { Home } from './components/Home'
import { AdminShiftTable } from './components/AdminShiftTable'
import { AdminJobCreate } from './components/AdminJobCreate'
import { AdminDraftJobsList } from './components/AdminDraftJobsList'
import { AdminDraftJobEdit } from './components/AdminDraftJobEdit'
import { AdminOpenJobsList } from './components/AdminOpenJobsList'
import { AdminJobEdit } from './components/AdminJobEdit'
import { AdminDashboard } from './components/AdminDashboard'
import { DriverJobsList } from './components/DriverJobsList'
import { DriverMyJobsList } from './components/DriverMyJobsList'
import { AdminConfirmedJobsList } from './components/AdminConfirmedJobsList'

export type PageType =
  | 'home'
  | 'shift-submit'
  | 'login'
  | 'admin-dashboard'
  | 'admin-shift-table'
  | 'admin-job-create'
  | 'admin-draft-jobs'
  | 'admin-draft-job-edit'
  | 'admin-open-jobs'
  | 'admin-job-edit'
  | 'admin-confirmed-jobs'
  | 'driver-jobs-list'
  | 'driver-my-jobs'

type UserRole = 'driver' | 'admin'

type Driver = {
  id: string
  email: string
  name: string | null
  role: UserRole
}

type ShiftAvailability = {
  id: string
  shift_date: string
  availability_status: 'ok' | 'ng'
  available_from_time: string | null
  max_jobs_per_day: 0 | 1 | 2
  note: string | null
}

function App() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pageName, setPageName] = useState<PageType>('home')
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [editingDraftJobId, setEditingDraftJobId] = useState<string | null>(null)

  const driverRef = useRef<Driver | null>(null)

  useEffect(() => {
    driverRef.current = driver
  }, [driver])

  const [dbShifts, setDbShifts] = useState<ShiftAvailability[]>([])
  const [localShifts, setLocalShifts] = useState<Map<string, Shift>>(new Map())
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const normalizeNullableString = (value?: string | null) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  const isDateLocked = (dateStr: string) => {
    const today = startOfDay(new Date())
    const target = startOfDay(parseISO(dateStr))
    const diff = differenceInDays(target, today)
    return diff <= 7
  }

  useEffect(() => {
    const newMap = new Map<string, Shift>()
    dbShifts.forEach((s) => {
      newMap.set(s.shift_date, {
        date: s.shift_date,
        status: s.availability_status as ShiftStatus,
        timeSlot: s.available_from_time || undefined,
        maxJobs: s.max_jobs_per_day,
        note: s.note || undefined,
      })
    })
    setLocalShifts(newMap)
  }, [dbShifts])

  const changesCount = useMemo(() => {
    const dbShiftMap = new Map(dbShifts.map((s) => [s.shift_date, s]))
    let count = 0

    localShifts.forEach((shift, dateStr) => {
      if (isDateLocked(dateStr)) return

      const dbObj = dbShiftMap.get(dateStr)

      if (!dbObj) {
        if (shift.status !== 'none') count++
      } else {
        if (shift.status === 'none') {
          count++
        } else if (
          dbObj.availability_status !== shift.status ||
          (dbObj.available_from_time || undefined) !== shift.timeSlot ||
          dbObj.max_jobs_per_day !== shift.maxJobs ||
          (dbObj.note || undefined) !== shift.note
        ) {
          count++
        }
      }
    })

    return count
  }, [localShifts, dbShifts])

  const hasChanges = changesCount > 0

  const normalizeAuthHash = () => {
    const hash = window.location.hash
    if (!hash) return null

    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const error = params.get('error')
    const errorCode = params.get('error_code')
    const errorDescription = params.get('error_description')

    if (error || errorCode) {
      const messageText =
        errorDescription?.replace(/\+/g, ' ') ||
        '認証リンクが無効、または期限切れです。'

      window.history.replaceState({}, document.title, window.location.pathname)
      return messageText
    }

    return null
  }

  const fetchData = async (background = false) => {
    try {
      if (background) {
        setRefreshing(true)
      } else {
        setLoading(true)
        setMessage('')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (!driverRef.current) {
          setDriver(null)
          setUserEmail(null)
          setDbShifts([])
          setLocalShifts(new Map())
        }
        return
      }

      setUserEmail(user.email ?? null)

      const { data: driverData, error: driverError } = await supabase
        .from('drivers')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (driverError) {
        throw driverError
      }

      if (!driverData) {
        if (!driverRef.current) {
          setDriver(null)
        }
        return
      }

      setDriver(driverData)

      const { data: shiftData, error: shiftError } = await supabase
        .from('shift_availability')
        .select('*')
        .eq('driver_id', driverData.id)

      if (shiftError) {
        throw shiftError
      }

      setDbShifts(shiftData ?? [])

      if (!background) {
        setMessage('')
      }
    } catch (e) {
      console.error(e)

      if (!background) {
        setMessage('データの取得に失敗しました。')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const hashError = normalizeAuthHash()

    if (hashError) {
      setMessage(hashError)
      setLoading(false)
      return
    }

    fetchData()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchData(true)
    })

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && driverRef.current) {
        fetchData(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  useEffect(() => {
    if (driver && pageName.startsWith('admin-') && driver.role !== 'admin') {
      setPageName('home')
    }
  }, [pageName, driver?.role])

  const handleLogin = async () => {
    try {
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })
      setMessage('メール送信しました')
    } catch (e) {
      console.error(e)
      setMessage('ログインリンクの送信に失敗しました。')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setDriver(null)
    setUserEmail(null)
    setDbShifts([])
    setLocalShifts(new Map())
    setSelectedDates([])
    setIsEditModalOpen(false)
    setMessage('')
    setEditingJobId(null)
    setEditingDraftJobId(null)
    setPageName('home')
  }

  const handleToggleDateSelection = (date: Date) => {
    setSelectedDates((prev) => {
      const exists = prev.some((d) => isSameDay(d, date))
      let newDates: Date[]

      if (exists) {
        newDates = prev.filter((d) => !isSameDay(d, date))
      } else {
        newDates = [...prev, date]
      }

      if (newDates.length === 0) {
        setIsEditModalOpen(false)
      }

      return newDates
    })
  }

  const handleApplyMultiEdit = (data: {
    status: ShiftStatus
    timeSlot?: string
    maxJobs?: number
    note?: string
  }) => {
    if (selectedDates.length === 0) return

    setLocalShifts((prevMap) => {
      const newMap = new Map(prevMap)

      selectedDates.forEach((date) => {
        const dateStr = format(date, 'yyyy-MM-dd')

        if (isDateLocked(dateStr)) return

        newMap.set(dateStr, {
          date: dateStr,
          ...data,
        })
      })

      return newMap
    })

    setSelectedDates([])
    setIsEditModalOpen(false)
  }

  const handleBulkSave = async () => {
    if (!driver) return
    if (!hasChanges) return

    setIsSaving(true)
    setMessage('')

    try {
      const upsertPayload: Array<{
        driver_id: string
        shift_date: string
        availability_status: 'ok' | 'ng'
        available_from_time: string | null
        max_jobs_per_day: number
        note: string | null
      }> = []

      const deleteIds: string[] = []
      const dbShiftMap = new Map(dbShifts.map((s) => [s.shift_date, s]))

      localShifts.forEach((localShift, dateStr) => {
        if (isDateLocked(dateStr)) return

        const dbShift = dbShiftMap.get(dateStr)

        if (localShift.status === 'none') {
          if (dbShift?.id) {
            deleteIds.push(dbShift.id)
          }
          return
        }

        const normalizedTimeSlot = normalizeNullableString(localShift.timeSlot)
        const normalizedNote = normalizeNullableString(localShift.note)
        const normalizedMaxJobs = localShift.maxJobs ?? 1

        const isChanged =
          !dbShift ||
          dbShift.availability_status !== localShift.status ||
          (dbShift.available_from_time ?? null) !== normalizedTimeSlot ||
          dbShift.max_jobs_per_day !== normalizedMaxJobs ||
          (dbShift.note ?? null) !== normalizedNote

        if (isChanged) {
          upsertPayload.push({
            driver_id: driver.id,
            shift_date: dateStr,
            availability_status: localShift.status,
            available_from_time: normalizedTimeSlot,
            max_jobs_per_day: normalizedMaxJobs,
            note: normalizedNote,
          })
        }
      })

      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('shift_availability')
          .delete()
          .in('id', deleteIds)

        if (deleteError) {
          throw deleteError
        }
      }

      if (upsertPayload.length > 0) {
        const { error: upsertError } = await supabase
          .from('shift_availability')
          .upsert(upsertPayload, {
            onConflict: 'driver_id,shift_date',
          })

        if (upsertError) {
          throw upsertError
        }
      }

      const totalChanged = upsertPayload.length + deleteIds.length
      setMessage(`保存しました（${totalChanged}件反映）`)

      await fetchData(true)
    } catch (e) {
      console.error(e)
      setMessage('保存に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return <div style={page}>読み込み中...</div>
  }

  if (!driver) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1 className="login-title">ドライバーログイン</h1>
            <p className="login-desc">
              ご登録のメールアドレスを入力してください。ログイン用のリンクをお送りします。
            </p>
          </div>

          <div className="login-form">
            <input
              type="email"
              className="login-input"
              placeholder="mail@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email) {
                  handleLogin()
                }
              }}
            />
            <button
              className="login-submit-btn"
              onClick={handleLogin}
              disabled={!email || loading}
            >
              ログインリンクを送信
            </button>
          </div>

          <p className="login-note">※パスワードの入力は不要です。</p>

          {message && (
            <div
              className={`login-message ${message.includes('失敗') || message.includes('無効')
                  ? 'error'
                  : 'success'
                }`}
            >
              {message}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (pageName === 'home') {
    return (
      <div style={page}>
        <div className="max-w-md w-full mx-auto">
          <header className="app-header">
            <h1>ホーム</h1>
            <div className="header-actions">
              <span className="user-email">{userEmail}</span>
              <button className="logout-btn" onClick={handleLogout}>
                ログアウト
              </button>
            </div>
          </header>

          {refreshing && <p className="hint-text">更新中...</p>}
          {message && <p className="hint-text">{message}</p>}

          <main className="main-content" style={{ width: '100%' }}>
            <Home
              shifts={dbShifts}
              isAdmin={driver.role === 'admin'}
              onNavigate={(page) => setPageName(page)}
            />
          </main>
        </div>
      </div>
    )
  }

  if (pageName === 'driver-jobs-list') {
    return (
      <div style={page}>
        <div className="max-w-md w-full mx-auto">
          <header className="app-header">
            <div className="header-actions" style={{ gap: 12 }}>
              <button
                className="logout-btn"
                onClick={() => setPageName('home')}
                style={{ minWidth: 'auto' }}
              >
                ← ホーム
              </button>
              <h1 style={{ margin: 0 }}>募集案件一覧</h1>
            </div>

            <div className="header-actions">
              <span className="user-email">{userEmail}</span>
              <button className="logout-btn" onClick={handleLogout}>
                ログアウト
              </button>
            </div>
          </header>

          <main className="main-content" style={{ width: '100%' }}>
            <DriverJobsList />
          </main>
        </div>
      </div>
    )
  }

  if (pageName === 'driver-my-jobs') {
    return (
      <div style={page}>
        <div className="max-w-md w-full mx-auto">
          <header className="app-header">
            <div className="header-actions" style={{ gap: 12 }}>
              <button
                className="logout-btn"
                onClick={() => setPageName('home')}
                style={{ minWidth: 'auto' }}
              >
                ← ホーム
              </button>
              <h1 style={{ margin: 0 }}>自分の案件一覧</h1>
            </div>

            <div className="header-actions">
              <span className="user-email">{userEmail}</span>
              <button className="logout-btn" onClick={handleLogout}>
                ログアウト
              </button>
            </div>
          </header>

          <main className="main-content" style={{ width: '100%' }}>
            <DriverMyJobsList />
          </main>
        </div>
      </div>
    )
  }

  if (pageName.startsWith('admin-')) {
    if (driver.role !== 'admin') {
      return null
    }
    return (
      <div style={page}>
        <div className="max-w-7xl w-full mx-auto">
          <header className="app-header">
            <div className="header-actions">
              <button
                className="logout-btn"
                onClick={() => {
                  setEditingJobId(null)
                  setEditingDraftJobId(null)
                  if (pageName === 'admin-dashboard') {
                    setPageName('home')
                  } else {
                    setPageName('admin-dashboard')
                  }
                }}
                style={{ minWidth: 'auto' }}
              >
                ← {pageName === 'admin-dashboard' ? 'ホーム' : '戻る'}
              </button>
            </div>
          </header>

          <main className="main-content" style={{ width: '100%' }}>
            {pageName === 'admin-dashboard' && (
              <AdminDashboard onNavigate={(page) => setPageName(page)} />
            )}

            {pageName === 'admin-shift-table' && <AdminShiftTable />}

            {pageName === 'admin-job-create' && (
              <AdminJobCreate
                onNavigateToDrafts={() => setPageName('admin-draft-jobs')}
              />
            )}

            {pageName === 'admin-draft-jobs' && (
              <AdminDraftJobsList
                onNavigateToCreate={() => setPageName('admin-job-create')}
                onEdit={(id) => {
                  setEditingDraftJobId(id)
                  setPageName('admin-draft-job-edit')
                }}
              />
            )}

            {pageName === 'admin-draft-job-edit' && editingDraftJobId && (
              <AdminDraftJobEdit
                jobId={editingDraftJobId}
                onBack={() => {
                  setEditingDraftJobId(null)
                  setPageName('admin-draft-jobs')
                }}
              />
            )}

            {pageName === 'admin-open-jobs' && (
              <AdminOpenJobsList
                onNavigateToCreate={() => setPageName('admin-job-create')}
                onEdit={(id) => {
                  setEditingJobId(id)
                  setPageName('admin-job-edit')
                }}
              />
            )}

            {pageName === 'admin-job-edit' && editingJobId && (
              <AdminJobEdit
                jobId={editingJobId}
                onBack={() => {
                  setEditingJobId(null)
                  setPageName('admin-open-jobs')
                }}
              />
            )}

            {pageName === 'admin-confirmed-jobs' && (
              <AdminConfirmedJobsList
                onBack={() => setPageName('admin-dashboard')}
              />
            )}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div style={page}>
      <div className="max-w-md w-full mx-auto pb-4">
        <header className="app-header">
          <div className="header-actions" style={{ gap: 12 }}>
            <button
              className="logout-btn"
              onClick={() => setPageName('home')}
              style={{ minWidth: 'auto' }}
            >
              ← ホーム
            </button>
            <h1 style={{ margin: 0 }}>シフト入力</h1>
          </div>

          <div className="header-actions">
            <span className="user-email">{userEmail}</span>
            <button className="logout-btn" onClick={handleLogout}>
              ログアウト
            </button>
          </div>
        </header>

        {refreshing && <p className="hint-text">更新中...</p>}
        {message && <p className="hint-text">{message}</p>}

        <main className="main-content">
          <p className="hint-text">
            日付をタップしてシフトを登録してください。複数選択も可能です。
          </p>

          <ShiftCalendar
            shifts={localShifts}
            selectedDates={selectedDates}
            onToggleDateSelection={handleToggleDateSelection}
          />
        </main>

        <SelectionBar
          selectedCount={selectedDates.length}
          onEdit={() => setIsEditModalOpen(true)}
          onClear={() => {
            setSelectedDates([])
            setIsEditModalOpen(false)
          }}
        />

        <ShiftEditModal
          isOpen={isEditModalOpen}
          selectedCount={selectedDates.length}
          onClose={() => setIsEditModalOpen(false)}
          onApply={handleApplyMultiEdit}
        />

        <BulkEditBar
          onSave={handleBulkSave}
          hasChanges={hasChanges}
          changesCount={changesCount}
          isSaving={isSaving}
        />
      </div>
    </div>
  )
}

const page: CSSProperties = {
  padding: '24px 24px 100px 24px',
  color: '#0f172a',
  background: '#f8fafc',
  minHeight: '100vh',
  width: '100%',
  boxSizing: 'border-box',
  overflowX: 'hidden',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

export default App