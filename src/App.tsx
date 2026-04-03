import { useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from './lib/supabase'
import { format, isSameDay } from 'date-fns'
import './App.css'
import type { Shift, ShiftStatus } from './types/shift'
import { ShiftCalendar } from './components/ShiftCalendar'
import { ShiftEditModal } from './components/ShiftEditModal'
import { BulkEditBar } from './components/BulkEditBar'
import { SelectionBar } from './components/SelectionBar'

type Driver = {
  id: string
  email: string
  name: string | null
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

  const driverRef = useRef<Driver | null>(null)

  useEffect(() => {
    driverRef.current = driver
  }, [driver])

  const [dbShifts, setDbShifts] = useState<ShiftAvailability[]>([])
  const [localShifts, setLocalShifts] = useState<Map<string, Shift>>(new Map())
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // DBデータが更新されたらローカル状態にマッピング
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
    let count = 0
    localShifts.forEach((shift, dateStr) => {
      const dbObj = dbShifts.find((s) => s.shift_date === dateStr)
      if (!dbObj) {
        if (shift.status !== 'none') count++
      } else {
        if (
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
      const message =
        errorDescription?.replace(/\+/g, ' ') ||
        '認証リンクが無効、または期限切れです。'

      window.history.replaceState({}, document.title, window.location.pathname)
      return message
    }

    return null
  }

  const fetchData = async (background = false) => {
    try {
      if (background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (!driverRef.current) {
          setDriver(null)
          setUserEmail(null)
          setDbShifts([])
        }
        return
      }

      setUserEmail(user.email ?? null)

      const { data: driverData } = await supabase
        .from('drivers')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (!driverData) {
        if (!driverRef.current) {
          setDriver(null)
        }
        return
      }

      setDriver(driverData)

      const { data: shiftData } = await supabase
        .from('shift_availability')
        .select('*')
        .eq('driver_id', driverData.id)

      setDbShifts(shiftData ?? [])
    } catch (e) {
      console.error(e)
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

  const handleLogin = async () => {
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    setMessage('メール送信しました')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setDriver(null)
    setUserEmail(null)
    setDbShifts([])
  }

  const handleToggleDateSelection = (date: Date) => {
    setSelectedDates((prev) => {
      const exists = prev.some((d) => isSameDay(d, date))
      let newDates
      if (exists) {
        newDates = prev.filter((d) => !isSameDay(d, date))
      } else {
        newDates = [...prev, date]
      }
      if (newDates.length === 0) setIsEditModalOpen(false)
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
        newMap.set(dateStr, {
          date: dateStr,
          ...data,
        })
      })
      return newMap
    })

    setSelectedDates([]) // Clear selection after applying
    setIsEditModalOpen(false)
  }

  const handleBulkSave = async () => {
    if (!driver) return

    setIsSaving(true)
    try {
      // TODO: ここにSupabaseへのBulk Upsertロジックを接続する
      // 今回は仮実装としてコンソール出力のみ
      console.log('--- Bulk Save ---')
      const payload: any[] = []
      localShifts.forEach((shift) => {
        // 未入力(none)でも削除などの対応が必要な場合は別途ロジックが必要
        if (shift.status !== 'none') {
          payload.push({
            driver_id: driver.id,
            shift_date: shift.date,
            availability_status: shift.status,
            available_from_time: shift.timeSlot || null,
            max_jobs_per_day: shift.maxJobs ?? 1,
            note: shift.note || null,
          })
        }
      })
      console.log('Payload to upload:', payload)
      alert(`保存しました！ (${payload.length}件のデータをコンソールに出力しました)`)

      // fetchData(true) // 本来であれば再取得する
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return <div style={page}>読み込み中...</div>
  }

  if (!driver) {
    return (
      <div style={page}>
        <h1>ログイン</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <button onClick={handleLogin}>ログインリンク送信</button>
        <p>{message}</p>
      </div>
    )
  }

  return (
    <div style={page}>
      <header className="app-header">
        <h1>シフト入力</h1>
        <div className="header-actions">
          <span className="user-email">{userEmail}</span>
          <button className="logout-btn" onClick={handleLogout}>ログアウト</button>
        </div>
      </header>

      {refreshing && <p className="hint-text">更新中...</p>}

      <main className="main-content">
        <p className="hint-text">日付をタップしてシフトを登録してください。複数選択も可能です。</p>

        <ShiftCalendar
          shifts={localShifts}
          selectedDates={selectedDates}
          onToggleDateSelection={handleToggleDateSelection}
        />

      </main>

      {/* Action Bar for currently selected dates */}
      <SelectionBar
        selectedCount={selectedDates.length}
        onEdit={() => setIsEditModalOpen(true)}
        onClear={() => {
          setSelectedDates([])
          setIsEditModalOpen(false)
        }}
      />

      {/* Bottom Sheet that opens when explicitly requested */}
      <ShiftEditModal
        isOpen={isEditModalOpen}
        selectedCount={selectedDates.length}
        onClose={() => setIsEditModalOpen(false)}
        onApply={handleApplyMultiEdit}
      />

      {/* Fixed bottom bar for saving */}
      <BulkEditBar
        onSave={handleBulkSave}
        hasChanges={hasChanges}
        changesCount={changesCount}
        isSaving={isSaving}
      />
    </div>
  )
}

const page: React.CSSProperties = {
  padding: '24px 24px 100px 24px', // bottom padding for BulkEditBar
  color: '#0f172a',
  background: '#f8fafc',
  minHeight: '100vh',
  width: '100%',
  boxSizing: 'border-box',
  overflowX: 'hidden',
  fontFamily: 'system-ui, -apple-system, sans-serif'
}

export default App