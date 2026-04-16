'use client'



import { useState, useEffect } from 'react'

import { createClient } from '@/lib/supabase/client'



interface ApiKeyManagerProps {

  userId: string

}



export default function ApiKeyManager({ userId }: ApiKeyManagerProps) {

  const [apiKey, setApiKey] = useState<string>('')

  const [loading, setLoading] = useState(true)

  const [regenerating, setRegenerating] = useState(false)

  const [copied, setCopied] = useState(false)

  const [showConfirm, setShowConfirm] = useState(false)

  const supabase = createClient()



  useEffect(() => {

    fetchApiKey()

  }, [])



  const fetchApiKey = async () => {

    try {

      const { data, error } = await supabase.functions.invoke('get-api-key')

      

      if (error) throw error

      

      if (data?.apiKey) {

        setApiKey(data.apiKey)

      }

    } catch (error) {

      console.error('获取API Key失败:', error)

    } finally {

      setLoading(false)

    }

  }



  const handleCopy = async () => {

    try {

      await navigator.clipboard.writeText(apiKey)

      setCopied(true)

      setTimeout(() => setCopied(false), 2000)

    } catch (error) {

      console.error('复制失败:', error)

    }

  }



  const handleRegenerate = async () => {

    setRegenerating(true)

    try {

      const { data, error } = await supabase.functions.invoke('regenerate-api-key')

      

      if (error) throw error

      

      if (data?.newApiKey) {

        setApiKey(data.newApiKey)

        setShowConfirm(false)

        alert('API Key已重新生成！请更新您的本地Agent配置。')

      }

    } catch (error) {

      console.error('重新生成API Key失败:', error)

      alert('重新生成失败，请重试')

    } finally {

      setRegenerating(false)

    }

  }



  if (loading) {

    return <div className="text-muted-foreground">加载中...</div>

  }



  return (

    <div className="space-y-4">

      <div className="flex items-center gap-2">

        <input

          type="text"

          value={apiKey}

          readOnly

          className="flex-1 px-3 py-2 bg-muted rounded border font-mono text-sm"

        />

        <button

          onClick={handleCopy}

          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"

        >

          {copied ? '已复制!' : '复制'}

        </button>

      </div>



      {!showConfirm ? (

        <button

          onClick={() => setShowConfirm(true)}

          className="text-sm text-destructive hover:underline"

        >

          重新生成API Key

        </button>

      ) : (

        <div className="border border-destructive rounded p-4 space-y-3">

          <p className="text-sm text-destructive">

            ⚠️ 警告：重新生成API Key将使旧密钥失效，所有使用旧密钥的Agent将无法访问。

          </p>

          <div className="flex gap-2">

            <button

              onClick={handleRegenerate}

              disabled={regenerating}

              className="px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50"

            >

              {regenerating ? '生成中...' : '确认重新生成'}

            </button>

            <button

              onClick={() => setShowConfirm(false)}

              className="px-4 py-2 border rounded hover:bg-muted"

            >

              取消

            </button>

          </div>

        </div>

      )}



      <div className="text-sm text-muted-foreground space-y-2">

        <p>使用说明：</p>

        <ol className="list-decimal list-inside space-y-1">

          <li>复制上方的API Key</li>

          <li>在您的本地Agent配置中设置此密钥</li>

          <li>Agent将使用此密钥向平台提交预测</li>

        </ol>

      </div>

    </div>

  )

}

