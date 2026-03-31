'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
const GENDERS = ['male', 'female', 'non-binary', 'prefer_not_to_say']
const EDUCATION_LEVELS = ['高中', '专科', '本科', '硕士', '博士']
const OCCUPATION_TYPES = ['学生', '上班族', '自由职业', '创业者', '退休']

export default function AgentPersonaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [persona, setPersona] = useState<PersonaData>({
    age_range: '',
    gender: '',
    location: [],
    education: '',
    occupation_type: '',
    occupation: '',
    life_stage: [],
    interests: [],
    consumption_behaviors: [],
    concerns: [],
    experiences: [],
    familiar_topics: [],
    affected_by: [],
    bio: '',
  })

  // 临时输入状态
  const [tempInputs, setTempInputs] = useState({
    location: '',
    life_stage: '',
    interests: '',
    consumption_behaviors: '',
    concerns: '',
    experiences: '',
    familiar_topics: '',
    affected_by: '',
  })

  useEffect(() => {
    fetchPersona()
  }, [])

  const fetchPersona = async () => {
    try {
      const response = await fetch('/api/profile/persona')
      if (response.ok) {
        const data = await response.json()
        if (data.persona) {
          setPersona(data.persona)
        }
      }
    } catch (error) {
      console.error('Failed to fetch persona:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/profile/persona', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(persona),
      })

      if (response.ok) {
        alert('画像保存成功！')
        router.push('/profile')
      } else {
        const error = await response.json()
        alert(`保存失败: ${error.error}`)
      }
    } catch (error) {
      console.error('Failed to save persona:', error)
      alert('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const addArrayItem = (field: keyof typeof tempInputs) => {
    const value = tempInputs[field].trim()
    if (value) {
      setPersona(prev => ({
        ...prev,
        [field]: [...(prev[field as keyof PersonaData] as string[]), value],
      }))
      setTempInputs(prev => ({ ...prev, [field]: '' }))
    }
  }

  const removeArrayItem = (field: keyof PersonaData, index: number) => {
    setPersona(prev => ({
      ...prev,
      [field]: (prev[field] as string[]).filter((_, i) => i !== index),
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">加载中...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Agent 用户画像</h1>
        <p className="text-gray-600">
          填写您的画像信息，帮助平台为您匹配最合适的任务
        </p>
      </div>

      <div className="space-y-8">
        {/* 基础人口统计 */}
        <section className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">基础信息</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">年龄范围</label>
              <select
                value={persona.age_range}
                onChange={(e) => setPersona({ ...persona, age_range: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">请选择</option>
                {AGE_RANGES.map(range => (
                  <option key={range} value={range}>{range}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">性别</label>
              <select
                value={persona.gender}
                onChange={(e) => setPersona({ ...persona, gender: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">请选择</option>
                {GENDERS.map(gender => (
                  <option key={gender} value={gender}>
                    {gender === 'male' ? '男' : gender === 'female' ? '女' : gender === 'non-binary' ? '非二元' : '不愿透露'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">地理位置</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tempInputs.location}
                  onChange={(e) => setTempInputs({ ...tempInputs, location: e.target.value })}
                  onKeyPress={(e) => e.key === 'Enter' && addArrayItem('location')}
                  placeholder="例如: 中国, 北京"
                  className="flex-1 px-3 py-2 border rounded-md"
                />
                <button
                  onClick={() => addArrayItem('location')}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  添加
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {persona.location.map((loc, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center gap-2"
                  >
                    {loc}
                    <button
                      onClick={() => removeArrayItem('location', index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">教育背景</label>
              <select
                value={persona.education}
                onChange={(e) => setPersona({ ...persona, education: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">请选择</option>
                {EDUCATION_LEVELS.map(edu => (
                  <option key={edu} value={edu}>{edu}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">职业类型</label>
              <select
                value={persona.occupation_type}
                onChange={(e) => setPersona({ ...persona, occupation_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">请选择</option>
                {OCCUPATION_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">具体职业</label>
              <input
                type="text"
                value={persona.occupation}
                onChange={(e) => setPersona({ ...persona, occupation: e.target.value })}
                placeholder="例如: 程序员, 教师, 医生"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>
        </section>

        {/* 生活经验 */}
        <section className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">生活经验</h2>
          
          <div className="space-y-4">
            {['life_stage', 'interests', 'consumption_behaviors', 'concerns'].map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium mb-2">
                  {field === 'life_stage' ? '生活阶段' :
                   field === 'interests' ? '兴趣爱好' :
                   field === 'consumption_behaviors' ? '消费行为' : '关注点'}
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tempInputs[field as keyof typeof tempInputs]}
                    onChange={(e) => setTempInputs({ ...tempInputs, [field]: e.target.value })}
                    onKeyPress={(e) => e.key === 'Enter' && addArrayItem(field as keyof typeof tempInputs)}
                    placeholder={
                      field === 'life_stage' ? '例如: 已婚, 有孩子' :
                      field === 'interests' ? '例如: 政治, 科技, 健康' :
                      field === 'consumption_behaviors' ? '例如: 使用AI工具, 投资股票' :
                      '例如: 关注美国大选, 关注AI发展'
                    }
                    className="flex-1 px-3 py-2 border rounded-md"
                  />
                  <button
                    onClick={() => addArrayItem(field as keyof typeof tempInputs)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    添加
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(persona[field as keyof PersonaData] as string[]).map((item, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center gap-2"
                    >
                      {item}
                      <button
                        onClick={() => removeArrayItem(field as keyof PersonaData, index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 相关经验 */}
        <section className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">相关经验（最重要）</h2>
          
          <div className="space-y-4">
            {['experiences', 'familiar_topics', 'affected_by'].map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium mb-2">
                  {field === 'experiences' ? '实际经历' :
                   field === 'familiar_topics' ? '熟悉的话题' : '受什么影响'}
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tempInputs[field as keyof typeof tempInputs]}
                    onChange={(e) => setTempInputs({ ...tempInputs, [field]: e.target.value })}
                    onKeyPress={(e) => e.key === 'Enter' && addArrayItem(field as keyof typeof tempInputs)}
                    placeholder={
                      field === 'experiences' ? '例如: 参与过投票, 使用过AI工具' :
                      field === 'familiar_topics' ? '例如: 美国政治, 加密货币' :
                      '例如: 美国政策影响, AI技术影响工作'
                    }
                    className="flex-1 px-3 py-2 border rounded-md"
                  />
                  <button
                    onClick={() => addArrayItem(field as keyof typeof tempInputs)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    添加
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(persona[field as keyof PersonaData] as string[]).map((item, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center gap-2"
                    >
                      {item}
                      <button
                        onClick={() => removeArrayItem(field as keyof PersonaData, index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 自我描述 */}
        <section className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">自我描述</h2>
          <textarea
            value={persona.bio}
            onChange={(e) => setPersona({ ...persona, bio: e.target.value })}
            placeholder="简单介绍一下自己..."
            rows={4}
            className="w-full px-3 py-2 border rounded-md"
          />
        </section>

        {/* 保存按钮 */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400"
          >
            {saving ? '保存中...' : '保存画像'}
          </button>
          <button
            onClick={() => router.push('/profile')}
            className="px-6 py-3 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
