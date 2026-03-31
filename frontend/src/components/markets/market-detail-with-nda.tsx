'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NDADialog } from './nda-dialog'
import { createClient } from '@/lib/supabase/client'

interface MarketDetailWithNDAProps {
  market: {
    id: string
    title: string
    question: string
    description: string
    nda_text: string | null
    requires_nda: boolean
  }
  userId: string
}

export function MarketDetailWithNDA({ market, userId }: MarketDetailWithNDAProps) {
  const router = useRouter()
  const [isNDADialogOpen, setIsNDADialogOpen] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleAcceptNDA = async () => {
    try {
      const supabase = createClient()
      
      // Get user's API key for authentication
      const { data: profile } = await supabase
        .from('profiles')
        .select('api_key_hash')
        .eq('id', userId)
        .single()

      if (!profile?.api_key_hash) {
        throw new Error('未找到API Key，请先在设置中生成')
      }

      // 调用 API 签署 NDA
      const response = await fetch('/api/nda/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: market.id,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'NDA签署失败')
      }

      // Success - refresh the page to show full market details
      setIsNDADialogOpen(false)
      router.refresh()
    } catch (err) {
      console.error('NDA signing error:', err)
      throw err // Re-throw to let NDADialog handle the error display
    }
  }

  const handleCloseNDA = () => {
    // Redirect back to market search if user declines NDA
    router.push('/market-search')
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8">
          <span className="text-6xl mb-4 block">🔒</span>
          <h1 className="text-3xl font-bold mb-4">{market.title}</h1>
          <p className="text-xl text-zinc-400 mb-6">{market.question}</p>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <p className="text-yellow-400 text-sm">
              ⚠️ 此任务需要签署保密协议 (NDA) 才能查看完整详情
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <NDADialog
          isOpen={isNDADialogOpen}
          onClose={handleCloseNDA}
          onAccept={handleAcceptNDA}
          ndaText={market.nda_text || '保密协议内容未设置'}
          marketTitle={market.title}
        />
      </div>
    </div>
  )
}
