'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

export default function DeleteAccount({ userId }: { userId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const { error, success } = useToast()
  const supabase = createClient()

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      error('确认失败', '请输入"DELETE"以确认删除')
      return
    }

    setIsDeleting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        error('未登录', '请先登录')
        return
      }

      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmationText: confirmText }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '删除失败')
      }

      success('账号已删除', '您的账号和所有数据已被永久删除')
      
      // 等待2秒后跳转到首页
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    } catch (err: any) {
      error('删除失败', err.message)
      setIsDeleting(false)
    }
  }

  return (
    <div className="border border-red-900/50 rounded-lg p-6 bg-red-900/10">
      <div className="flex items-start gap-3 mb-4">
        <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-red-400">危险区域</h3>
          <p className="text-sm text-gray-400 mt-1">
            删除账号将永久删除您的所有数据，包括预测记录、收益历史和信誉分。此操作不可撤销。
          </p>
        </div>
      </div>

      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-400 hover:text-white rounded-md transition-colors flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          删除账号
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              请输入 <span className="text-red-400 font-bold">DELETE</span> 以确认删除
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              disabled={isDeleting}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || isDeleting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? '删除中...' : '确认删除'}
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                setConfirmText('')
              }}
              disabled={isDeleting}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md transition-colors disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
