'use client'

import { useState, useEffect } from 'react'
import { Activity, Zap, Users, TrendingUp } from 'lucide-react'

interface LiveStat {
  icon: React.ReactNode
  label: string
  value: number
  suffix: string
  color: string
  pulseColor: string
}

export function LivePulse() {
  const [stats, setStats] = useState<LiveStat[]>([
    {
      icon: <Users className="w-4 h-4" />,
      label: 'Agents Online',
      value: 12403,
      suffix: '',
      color: 'text-emerald-400',
      pulseColor: 'bg-emerald-400',
    },
    {
      icon: <Zap className="w-4 h-4" />,
      label: 'Predictions/min',
      value: 53,
      suffix: '',
      color: 'text-blue-400',
      pulseColor: 'bg-blue-400',
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      label: 'Active Markets',
      value: 247,
      suffix: '',
      color: 'text-purple-400',
      pulseColor: 'bg-purple-400',
    },
    {
      icon: <Activity className="w-4 h-4" />,
      label: 'Accuracy Rate',
      value: 87,
      suffix: '%',
      color: 'text-orange-400',
      pulseColor: 'bg-orange-400',
    },
  ])

  // 模拟实时数据更新
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prevStats =>
        prevStats.map(stat => {
          // 随机小幅波动
          const change = Math.floor(Math.random() * 10) - 5
          let newValue = stat.value + change

          // 设置合理的范围
          if (stat.label === 'Agents Online') {
            newValue = Math.max(10000, Math.min(15000, newValue))
          } else if (stat.label === 'Predictions/min') {
            newValue = Math.max(30, Math.min(100, newValue))
          } else if (stat.label === 'Active Markets') {
            newValue = Math.max(200, Math.min(300, newValue))
          } else if (stat.label === 'Accuracy Rate') {
            newValue = Math.max(80, Math.min(95, newValue))
          }

          return { ...stat, value: newValue }
        })
      )
    }, 3000) // 每3秒更新一次

    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* 桌面版 - 水平布局 */}
      <div className="hidden lg:inline-flex items-center gap-6 px-6 py-3 bg-zinc-900/50 border border-zinc-800 rounded-full backdrop-blur-sm">
        {stats.map((stat, index) => (
          <div key={index} className="flex items-center gap-2">
            {/* 脉搏指示器 */}
            <div className="relative">
              <div className={`w-2 h-2 ${stat.pulseColor} rounded-full animate-pulse`} />
              <div className={`absolute inset-0 w-2 h-2 ${stat.pulseColor} rounded-full animate-ping opacity-75`} />
            </div>

            {/* 图标 */}
            <div className={stat.color}>
              {stat.icon}
            </div>

            {/* 数值 */}
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-bold font-mono ${stat.color} tabular-nums`}>
                {stat.value.toLocaleString()}
              </span>
              {stat.suffix && (
                <span className={`text-sm ${stat.color}`}>
                  {stat.suffix}
                </span>
              )}
            </div>

            {/* 标签 */}
            <span className="text-xs text-zinc-500 font-mono whitespace-nowrap">
              {stat.label}
            </span>

            {/* 分隔线 */}
            {index < stats.length - 1 && (
              <div className="w-px h-6 bg-zinc-700 ml-2" />
            )}
          </div>
        ))}
      </div>

      {/* 移动端 - 网格布局 */}
      <div className="lg:hidden grid grid-cols-2 gap-3 w-full max-w-md">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="flex items-center gap-2 px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg backdrop-blur-sm"
          >
            {/* 脉搏指示器 */}
            <div className="relative flex-shrink-0">
              <div className={`w-2 h-2 ${stat.pulseColor} rounded-full animate-pulse`} />
              <div className={`absolute inset-0 w-2 h-2 ${stat.pulseColor} rounded-full animate-ping opacity-75`} />
            </div>

            <div className="flex-1 min-w-0">
              {/* 数值和图标 */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className={stat.color}>
                  {stat.icon}
                </div>
                <span className={`text-base font-bold font-mono ${stat.color} tabular-nums`}>
                  {stat.value.toLocaleString()}{stat.suffix}
                </span>
              </div>
              {/* 标签 */}
              <div className="text-xs text-zinc-500 font-mono truncate">
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
