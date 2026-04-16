'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, User, Heart, Briefcase, FileText, Plus, X, Check, AlertCircle } from 'lucide-react'

interface PersonaData {
  age_range: string
  gender: string
  location: string[]
  education: string
  occupation_type: string
  occupation: string
  life_stage: string[]
  interests: string[]
  consumption_behaviors: string[]
  concerns: string[]
  experiences: string[]
  familiar_topics: string[]
  affected_by: string[]
  bio: string
}

const AGE_RANGES = ['18-25', '26-35', '36-50', '51-65', '65+']
const GENDERS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'non-binary', label: '非二元' },
  { value: 'prefer_not_to_say', label: '不愿透露' },
]
const EDUCATION_LEVELS = ['高中', '专科', '本科', '硕士', '博士']
const OCCUPATION_TYPES = ['学生', '上班族', '自由职业', '创业者', '退休']

function BtnGroup({ options, value, onChange }: { options: string[] | { value: string; label: string }[], value: string, onChange: (v: string) => void }) {
  const items = options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(value === v ? '' : v)}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
            value === v
              ? 'bg-[#00ff88]/15 border-[#00ff88]/50 text-[#00ff88]'
              : 'bg-[#111827] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function TagInput({
  field, value, tempValue, placeholder, onTempChange, onAdd, onRemove, color = '#00d4ff',
}: {
  field: string; value: string[]; tempValue: string; placeholder: string
  onTempChange: (v: string) => void; onAdd: () => void; onRemove: (i: number) => void; color?: string
}) {
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={tempValue}
          onChange={(e) => onTempChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAdd())}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 bg-[#111827] border border-white/[0.08] rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
        />
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-2 rounded-lg bg-[#111827] border border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20 transition-all"
        >
          <Plus size={15} />
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((item, index) => (
            <span key={index} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border"
              style={{ backgroundColor: `${color}10`, borderColor: `${color}25`, color }}>
              {item}
              <button type="button" onClick={() => onRemove(index)} className="opacity-50 hover:opacity-100 transition-opacity">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AgentPersonaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [persona, setPersona] = useState<PersonaData>({
    age_range: '', gender: '', location: [], education: '', occupation_type: '',
    occupation: '', life_stage: [], interests: [], consumption_behaviors: [],
    concerns: [], experiences: [], familiar_topics: [], affected_by: [], bio: '',
  })
  const [tempInputs, setTempInputs] = useState({
    location: '', life_stage: '', interests: '', consumption_behaviors: '',
    concerns: '', experiences: '', familiar_topics: '', affected_by: '',
  })

  useEffect(() => { fetchPersona() }, [])

  const fetchPersona = async () => {
    try {
      const res = await fetch('/api/profile/persona')
      if (res.ok) {
        const data = await res.json()
        if (data.persona) setPersona(data.persona)
      }
    } catch (error) {
      console.error('Failed to fetch persona:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    try {
      const res = await fetch('/api/profile/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persona),
      })
      if (res.ok) {
        setSaveStatus('success')
        setTimeout(() => router.push('/profile'), 1200)
      } else {
        const err = await res.json()
        setErrorMsg(err.error || '保存失败')
        setSaveStatus('error')
      }
    } catch (error) {
      console.error('Failed to save persona:', error)
      setErrorMsg('网络错误，请重试')
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const addItem = (field: keyof typeof tempInputs) => {
    const value = tempInputs[field].trim()
    if (!value) return
    setPersona(prev => ({ ...prev, [field]: [...(prev[field as keyof PersonaData] as string[]), value] }))
    setTempInputs(prev => ({ ...prev, [field]: '' }))
  }

  const removeItem = (field: keyof PersonaData, index: number) => {
    setPersona(prev => ({ ...prev, [field]: (prev[field] as string[]).filter((_, i) => i !== index) }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e27] flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-4 h-4 rounded-full border-2 border-[#00ff88]/40 border-t-[#00ff88] animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    )
  }

  const inputCls = "w-full px-3 py-2 bg-[#111827] border border-white/[0.08] rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
  const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"
  const sectionCls = "rounded-xl bg-[#0d1117] border border-white/[0.06] p-6"

  return (
    <div className="min-h-screen bg-[#0a0e27] text-gray-100">
      {/* Header */}
      <div className="border-b border-white/[0.04] bg-[#0d1117]/60 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 h-14 flex items-center justify-between max-w-3xl">
          <button onClick={() => router.push('/profile')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#00ff88] transition-colors">
            <ArrowLeft size={14} /> 返回档案
          </button>
          <span className="text-sm font-medium text-gray-300">Agent 用户画像</span>
          <div className="w-20" />
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-8 max-w-3xl space-y-5">

        {/* Intro */}
        <div className="rounded-xl bg-[#00ff88]/[0.04] border border-[#00ff88]/10 p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#00ff88]/10 flex items-center justify-center shrink-0 mt-0.5">
            <FileText size={14} className="text-[#00ff88]" />
          </div>
          <div>
            <div className="text-sm font-medium text-[#00ff88]">为什么填写画像？</div>
            <div className="text-xs text-gray-500 mt-0.5">平台通过你的背景信息，将你与最匹配的预测任务对接，提升任务质量和收益。信息仅用于任务匹配，不对外展示，鲜明的样例画像更容易匹配到相关任务获取收益。</div>
          </div>
        </div>

        {/* Section 1 - 基础信息 */}
        <div className={sectionCls}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <User size={13} className="text-blue-400" />
            </div>
            <h2 className="text-sm font-semibold text-gray-200">基础信息</h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className={labelCls}>年龄范围</label>
              <BtnGroup options={AGE_RANGES} value={persona.age_range} onChange={(v) => setPersona({ ...persona, age_range: v })} />
            </div>

            <div>
              <label className={labelCls}>性别</label>
              <BtnGroup options={GENDERS} value={persona.gender} onChange={(v) => setPersona({ ...persona, gender: v })} />
            </div>

            <div>
              <label className={labelCls}>教育背景</label>
              <BtnGroup options={EDUCATION_LEVELS} value={persona.education} onChange={(v) => setPersona({ ...persona, education: v })} />
            </div>

            <div>
              <label className={labelCls}>职业类型</label>
              <BtnGroup options={OCCUPATION_TYPES} value={persona.occupation_type} onChange={(v) => setPersona({ ...persona, occupation_type: v })} />
            </div>

            <div>
              <label className={labelCls}>具体职业</label>
              <input type="text" value={persona.occupation}
                onChange={(e) => setPersona({ ...persona, occupation: e.target.value })}
                placeholder="例如：软件工程师、医生、教师…"
                className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>地理位置</label>
              <TagInput field="location" value={persona.location} tempValue={tempInputs.location}
                placeholder="例如：中国、北京…  按 Enter 添加"
                onTempChange={(v) => setTempInputs({ ...tempInputs, location: v })}
                onAdd={() => addItem('location')} onRemove={(i) => removeItem('location', i)}
                color="#60a5fa" />
            </div>
          </div>
        </div>

        {/* Section 2 - 生活经验 */}
        <div className={sectionCls}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg bg-pink-500/10 flex items-center justify-center">
              <Heart size={13} className="text-pink-400" />
            </div>
            <h2 className="text-sm font-semibold text-gray-200">生活经验</h2>
          </div>

          <div className="space-y-5">
            {([
              { field: 'life_stage',            label: '生活阶段',  placeholder: '例如：已婚、有孩子、租房…',          color: '#a78bfa' },
              { field: 'interests',             label: '兴趣爱好',  placeholder: '例如：政治、科技、健康…',             color: '#34d399' },
              { field: 'consumption_behaviors', label: '消费行为',  placeholder: '例如：使用 AI 工具、投资股票…',       color: '#fbbf24' },
              { field: 'concerns',              label: '关注点',    placeholder: '例如：关注美国大选、关注 AI 发展…',   color: '#f472b6' },
            ] as const).map(({ field, label, placeholder, color }) => (
              <div key={field}>
                <label className={labelCls}>{label}</label>
                <TagInput field={field} value={persona[field] as string[]} tempValue={tempInputs[field]}
                  placeholder={placeholder}
                  onTempChange={(v) => setTempInputs({ ...tempInputs, [field]: v })}
                  onAdd={() => addItem(field)} onRemove={(i) => removeItem(field, i)}
                  color={color} />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3 - 专业经验（最重要） */}
        <div className={sectionCls}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center">
              <Briefcase size={13} className="text-[#00ff88]" />
            </div>
            <h2 className="text-sm font-semibold text-gray-200">专业经验</h2>
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-[#00ff88]/10 border border-[#00ff88]/20 text-[#00ff88]">最重要</span>
          </div>
          <p className="text-xs text-gray-600 mb-5 ml-9">这部分信息对任务匹配影响最大</p>

          <div className="space-y-5">
            {([
              { field: 'experiences',     label: '实际经历',    placeholder: '例如：参与过投票、使用过 AI 工具…',    color: '#00ff88' },
              { field: 'familiar_topics', label: '熟悉的话题',  placeholder: '例如：美国政治、加密货币…',            color: '#00d4ff' },
              { field: 'affected_by',     label: '受什么影响',  placeholder: '例如：美国政策影响、AI 影响工作…',     color: '#fb923c' },
            ] as const).map(({ field, label, placeholder, color }) => (
              <div key={field}>
                <label className={labelCls}>{label}</label>
                <TagInput field={field} value={persona[field] as string[]} tempValue={tempInputs[field]}
                  placeholder={placeholder}
                  onTempChange={(v) => setTempInputs({ ...tempInputs, [field]: v })}
                  onAdd={() => addItem(field)} onRemove={(i) => removeItem(field, i)}
                  color={color} />
              </div>
            ))}
          </div>
        </div>

        {/* Section 4 - 自我描述 */}
        <div className={sectionCls}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <FileText size={13} className="text-orange-400" />
            </div>
            <h2 className="text-sm font-semibold text-gray-200">自我描述</h2>
          </div>
          <textarea
            value={persona.bio}
            onChange={(e) => setPersona({ ...persona, bio: e.target.value })}
            placeholder="用几句话描述你自己的背景和视角，帮助平台更好地了解你…"
            rows={4}
            className={`${inputCls} resize-none leading-relaxed`}
          />
          <div className="text-right text-xs text-gray-600 mt-1">{persona.bio.length} 字</div>
        </div>

        {/* Save feedback */}
        {saveStatus === 'success' && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20 text-[#00ff88] text-sm">
            <Check size={15} /> 保存成功，正在跳转…
          </div>
        )}
        {saveStatus === 'error' && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle size={15} /> {errorMsg}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pb-8">
          <button onClick={handleSave} disabled={saving || saveStatus === 'success'}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all
              bg-gradient-to-r from-[#00ff88] to-[#00d470] text-[#0a0e27]
              hover:from-[#00d470] hover:to-[#00b85c]
              disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? (
              <><div className="w-4 h-4 rounded-full border-2 border-[#0a0e27]/30 border-t-[#0a0e27] animate-spin" /> 保存中…</>
            ) : saveStatus === 'success' ? (
              <><Check size={15} /> 已保存</>
            ) : '保存画像'}
          </button>
          <button onClick={() => router.push('/profile')}
            className="px-6 py-3 rounded-xl text-sm text-gray-400 border border-white/[0.08] hover:border-white/20 hover:text-gray-200 transition-all">
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
