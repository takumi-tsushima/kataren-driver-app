import React, { useEffect, useState } from 'react'
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  FileText,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  List,
  Info,
  Briefcase
} from 'lucide-react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
} from 'date-fns'
import { supabase } from '../lib/supabase'

interface CustomDatePickerProps {
  value: string
  onChange: (dateStr: string) => void
  placeholder?: string
}

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  placeholder = '年/月/日を選択',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(value ? parseISO(value) : new Date())

  const handleOpen = () => {
    if (value) {
      setViewDate(parseISO(value))
    } else {
      setViewDate(new Date())
    }
    setIsOpen(true)
  }

  const handlePrevMonth = () => setViewDate(subMonths(viewDate, 1))
  const handleNextMonth = () => setViewDate(addMonths(viewDate, 1))

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate })

  return (
    <div className="relative">
      <button
        type="button"
        className={`w-full text-left box-border border rounded-xl p-3.5 flex justify-between items-center transition-colors bg-white 
          ${isOpen ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-300 hover:border-slate-400'}
        `}
        onClick={handleOpen}
      >
        <span className={value ? 'text-slate-900 font-bold' : 'text-slate-400 font-semibold'}>
          {value ? format(parseISO(value), 'yyyy/MM/dd') : placeholder}
        </span>
        <Calendar size={18} className="text-slate-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="absolute top-[calc(100%+8px)] left-0 z-50 bg-white rounded-2xl p-5 w-[320px] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-900 m-0">日付を選択</h3>
              <button className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-full transition-colors" onClick={() => setIsOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>

            <div className="flex justify-between items-center mb-4">
              <button type="button" className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors" onClick={handlePrevMonth}>
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold text-slate-800">{format(viewDate, 'yyyy年 M月')}</span>
              <button type="button" className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors" onClick={handleNextMonth}>
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
                <div key={day} className="text-[11px] font-bold text-slate-400 py-1">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarDays.map((date) => {
                const dateStr = format(date, 'yyyy-MM-dd')
                const isSelected = value === dateStr
                const isCurrentMonth = isSameMonth(date, viewDate)
                const isTodayDate = isToday(date)

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    className={`
                      aspect-square rounded-full flex items-center justify-center text-sm font-semibold transition-all
                      ${!isCurrentMonth ? 'text-slate-300' : 'text-slate-700'}
                      ${isSelected ? 'bg-slate-900 text-white shadow-md scale-105' : 'hover:bg-slate-100'}
                      ${isTodayDate && !isSelected ? 'bg-blue-50 text-blue-600' : ''}
                    `}
                    onClick={() => {
                      onChange(dateStr)
                      setIsOpen(false)
                    }}
                  >
                    {format(date, 'd')}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

type DriverRow = {
  id: string
  email: string
  name: string | null
}

export const AdminJobCreate: React.FC<{
  onNavigateToDrafts: () => void
}> = ({ onNavigateToDrafts }) => {
  const [workDate, setWorkDate] = useState('')
  const [storeName, setStoreName] = useState('')
  const [headcount, setHeadcount] = useState(1)
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('23:59')
  const [notes, setNotes] = useState('')

  const [currentDriver, setCurrentDriver] = useState<DriverRow | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  useEffect(() => {
    const fetchCurrentDriver = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) return

        const { data, error } = await supabase
          .from('drivers')
          .select('id, email, name')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (error) throw error

        setCurrentDriver(data ?? null)
      } catch (error) {
        console.error(error)
        setMessage('ログインユーザー情報の取得に失敗しました。')
        setMessageType('error')
      }
    }

    fetchCurrentDriver()
  }, [])

  const resetForm = () => {
    setWorkDate('')
    setStoreName('')
    setHeadcount(1)
    setDeadlineDate('')
    setDeadlineTime('23:59')
    setNotes('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setMessage('')
    setMessageType('')

    if (!workDate || !deadlineDate || !deadlineTime || !storeName || !headcount) {
      setMessage('必須項目を入力してください。')
      setMessageType('error')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (!currentDriver) {
      setMessage('作成者情報が取得できません。再ログイン後にお試しください。')
      setMessageType('error')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const deadline = new Date(`${deadlineDate}T${deadlineTime}:00`)

    if (Number.isNaN(deadline.getTime())) {
      setMessage('募集締切の日時が不正です。')
      setMessageType('error')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const workDateStart = new Date(`${workDate}T00:00:00`)

    if (deadline >= workDateStart) {
      setMessage('募集締切は稼働日より前の日時に設定してください。')
      setMessageType('error')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setIsSubmitting(true)

    try {
      const { error } = await supabase.from('jobs').insert([
        {
          work_date: workDate,
          location: storeName,
          capacity: Number(headcount),
          application_deadline: deadline.toISOString(),
          note: notes.trim() || null,
          status: 'draft',
          created_by: currentDriver.id,
        },
      ])

      if (error) throw error

      setMessage('案件を下書き保存しました。')
      setMessageType('success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      resetForm()
    } catch (error) {
      console.error(error)
      setMessage('案件の保存に失敗しました。時間をおいて再度お試しください。')
      setMessageType('error')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full pb-32 md:pb-12 relative flex flex-col md:flex-row gap-8 items-start">
      {/* Left Column: Form */}
      <div className="flex-1 w-full">
        <div className="flex justify-between items-start gap-4 mb-6 flex-wrap">
          <div>
            <h2 className="m-0 text-3xl font-bold text-slate-900 tracking-tight">新規案件の作成</h2>
            <p className="mt-2 text-slate-500 font-medium">ドライバー向けの募集案件を下書きとして保存します。</p>
          </div>

          <button 
            className="md:hidden border border-slate-300 bg-white text-slate-700 rounded-xl px-4 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm" 
            type="button" 
            onClick={onNavigateToDrafts}
          >
            <List size={18} />
            下書き一覧
          </button>
        </div>

        {message && (
          <div
            className={`p-4 rounded-xl font-bold mb-6 flex items-start gap-3 shadow-sm border ${
              messageType === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <Info size={20} className="shrink-0 mt-0.5" />
            <p className="m-0">{message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Section 1: 基本情報 */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-5 pb-3 border-b border-slate-100 flex items-center gap-2">
              <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg"><Info size={18} /></div>
              基本情報
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                  <Calendar size={16} className="text-slate-400" />
                  稼働日
                  <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ml-auto">必須</span>
                </label>
                <CustomDatePicker
                  value={workDate}
                  onChange={setWorkDate}
                  placeholder="年/月/日"
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                  <MapPin size={16} className="text-slate-400" />
                  店舗
                  <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ml-auto">必須</span>
                </label>
                <select
                  className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3.5 text-[15px] font-bold bg-white transition-colors cursor-pointer appearance-none"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                  required
                >
                  <option value="" disabled className="text-slate-400">店舗を選択してください</option>
                  <option value="トヨタレンタカー赤羽駅前店">トヨタレンタカー赤羽駅前店</option>
                  <option value="トヨタレンタカー練馬駅前店">トヨタレンタカー練馬駅前店</option>
                  <option value="トヨタレンタカー中野坂上店">トヨタレンタカー中野坂上店</option>
                  <option value="トヨタレンタカー吾妻橋店">トヨタレンタカー吾妻橋店</option>
                  <option value="トヨタレンタカー池袋東口店">トヨタレンタカー池袋東口店</option>
                  <option value="トヨタレンタカー東京駅八重洲口店">トヨタレンタカー東京駅八重洲口店</option>
                  <option value="トヨタレンタカー成田空港店">トヨタレンタカー成田空港店</option>
                </select>
              </div>
            </div>
          </section>

          {/* Section 2: 募集条件 */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-5 pb-3 border-b border-slate-100 flex items-center gap-2">
              <div className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg"><Briefcase size={18} /></div>
              募集条件
            </h3>
            
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2 md:w-1/2 md:pr-2.5">
                <label className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                  <Users size={16} className="text-slate-400" />
                  必要人数
                  <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ml-auto">必須</span>
                </label>
                <select
                  className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3.5 text-[15px] font-bold bg-white transition-colors cursor-pointer appearance-none"
                  value={headcount}
                  onChange={(e) => setHeadcount(Number(e.target.value))}
                  style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                  required
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <option key={num} value={num}>
                      {num} 名
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                      <Clock size={16} className="text-slate-400" />
                      募集締切日
                      <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ml-auto">必須</span>
                    </label>
                    <CustomDatePicker
                      value={deadlineDate}
                      onChange={setDeadlineDate}
                      placeholder="年/月/日"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                      <Clock size={16} className="opacity-0" /> {/* Alignment padding */}
                      締切時刻
                    </label>
                    <select
                      className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-3.5 text-[15px] font-bold bg-white transition-colors cursor-pointer appearance-none"
                      value={deadlineTime}
                      onChange={(e) => setDeadlineTime(e.target.value)}
                      style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                      required
                    >
                      <option value="09:00">09:00</option>
                      <option value="12:00">12:00</option>
                      <option value="15:00">15:00</option>
                      <option value="18:00">18:00</option>
                      <option value="21:00">21:00</option>
                      <option value="23:59">23:59</option>
                    </select>
                  </div>
              </div>
            </div>
          </section>

          {/* Section 3: 備考 */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-5 pb-3 border-b border-slate-100 flex items-center gap-2">
              <div className="bg-amber-100 text-amber-600 p-1.5 rounded-lg"><FileText size={18} /></div>
              備考
            </h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                補足情報
                <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ml-auto">任意</span>
              </label>
              <textarea
                className="w-full box-border border border-slate-300 hover:border-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 rounded-xl p-4 text-[15px] font-medium bg-white min-h-[140px] transition-colors leading-relaxed"
                placeholder="案件に関する注意事項や必要な持ち物などがあれば入力してください。"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </section>

          {/* SP用のSticky CTA（Mobile Only） */}
          <div className="md:hidden fixed bottom-6 left-4 right-4 z-20">
            <button 
              type="submit" 
              className="w-full bg-slate-900 text-white rounded-2xl py-4 font-bold text-lg flex items-center justify-center gap-2 shadow-[0_8px_30px_rgba(15,23,42,0.3)] hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100" 
              disabled={isSubmitting}
            >
              <Save size={20} />
              {isSubmitting ? '保存中...' : '案件を下書き保存'}
            </button>
          </div>
        </form>
      </div>

      {/* Right Column: Sticky Sidebar for PC */}
      <div className="hidden md:block w-80 shrink-0 sticky top-6">
        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200">
          <h3 className="font-extrabold text-slate-800 mb-4 text-lg">アクション</h3>
          
          <button 
            type="button"
            onClick={handleSubmit}
            className="w-full bg-slate-900 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-slate-800 transition-colors mb-4 disabled:opacity-50" 
            disabled={isSubmitting}
          >
            <Save size={18} />
            {isSubmitting ? '保存中...' : '案件を下書き保存'}
          </button>
          
          <hr className="border-slate-200 my-4" />

          <button 
            className="w-full border border-slate-300 bg-white text-slate-700 rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 hover:bg-white hover:border-slate-400 transition-colors shadow-sm" 
            type="button" 
            onClick={onNavigateToDrafts}
          >
            <List size={18} />
            下書き一覧へ
          </button>

          <div className="mt-8">
            <h4 className="text-sm font-bold text-slate-600 mb-2">💡 Tips</h4>
            <p className="text-sm font-medium text-slate-500 leading-relaxed">
              作成した案件は、まず「下書き」として保存されます。一覧画面から内容を確認し、問題なければ本公開を行ってください。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}