'use client'

import { useState, useEffect, useRef } from 'react'
import { TrendingUp, Clock, DollarSign } from 'lucide-react'
import Link from 'next/link'

interface HotTask {
  id: string
  title: string
  question: string
  reward_pool: number
  prediction_count: number
  closes_at: string
  status: string
}

export function HotTasksCarousel() {
  const [hotTasks, setHotTasks] = useState<HotTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchHotTasks()
  }, [])

  useEffect(() => {
    if (!scrollContainerRef.current || hotTasks.length === 0) return

    const container = scrollContainerRef.current
    let scrollPosition = 0
    const scrollSpeed = 0.8
    let animationFrameId: number

    const scroll = () => {
      scrollPosition += scrollSpeed
      container.scrollLeft = scrollPosition

      const cardWidth = 304
      const singleSetWidth = cardWidth * hotTasks.length
      
      if (scrollPosition >= singleSetWidth) {
        scrollPosition = 0
        container.scrollLeft = 0
      }

      animationFrameId = requestAnimationFrame(scroll)
    }

    animationFrameId = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(animationFrameId)
  }, [hotTasks])

  const fetchHotTasks = async () => {
    try {
      const response = await fetch('/api/hot-tasks?limit=8')
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      setHotTasks(data.tasks || [])
      setIsLoading(false)
    } catch (error) {
      console.error('Failed to fetch hot tasks:', error)
      setIsLoading(false)
    }
  }

  if (isLoading || hotTasks.length === 0) return null

  return (
    <section className="container mx-auto px-6 py-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-400" />
              <h2 className="text-2xl font-bold text-white">🔥 火热搜索任务</h2>
            </div>
            <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded-full border border-red-500/30 animate-pulse">HOT</span>
          </div>
          <Link href="/market-search" className="text-sm text-zinc-400 hover:text-emerald-400 transition-colors font-mono">查看全部 →</Link>
        </div>

        <div className="relative -mx-6 px-6 py-12 overflow-hidden">
          <div className="absolute left-6 top-0 bottom-0 w-20 bg-gradient-to-r from-black via-black/90 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-6 top-0 bottom-0 w-20 bg-gradient-to-l from-black via-black/90 to-transparent z-10 pointer-events-none" />
          <div ref={scrollContainerRef} className="scrollbar-hide" style={{ overflowX: 'scroll', overflowY: 'visible' }}>
            <div className="flex gap-4">
              {[...hotTasks, ...hotTasks, ...hotTasks, ...hotTasks].map((task, index) => (
                <HotTaskCard key={`${task.id}-${index}`} task={task} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  )
}

function HotTaskCard({ task }: { task: HotTask }) {
  const daysLeft = Math.ceil((new Date(task.closes_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return (
    <Link href={`/searchs/${task.id}`} className="flex-shrink-0 w-72 p-4 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 hover:border-emerald-500/50 hover:from-zinc-800 transition-all duration-300 hover:scale-104 shadow-lg hover:shadow-emerald-500/10 group cursor-pointer">
      <h3 className="text-base font-bold mb-2 text-white group-hover:text-emerald-400 transition-colors line-clamp-2 min-h-[3rem]">{task.title}</h3>
      <p className="text-sm text-zinc-400 mb-3 line-clamp-2 min-h-[2.5rem]">{task.question}</p>
      <div className="flex items-center gap-3 mb-3 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-400" /><span>{task.prediction_count} 预测</span></div>
        <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-400" /><span>{daysLeft} 天</span></div>
      </div>
      <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-yellow-400" /><span className="text-sm text-zinc-400">奖励池</span></div>
        <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">${task.reward_pool}</span>
      </div>
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50">
          <span className="text-emerald-300 text-xs">→</span>
        </div>
      </div>
    </Link>
  )
}
