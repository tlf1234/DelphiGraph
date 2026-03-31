'use client'

import Link from 'next/link'
import { TrendingUp, Users } from 'lucide-react'

interface TrendingPrediction {
  taskId: string
  title: string
  consensusProbability: number
  predictionCount: number
  trend: 'up' | 'down' | 'stable'
}

interface TrendingPredictionsProps {
  predictions: TrendingPrediction[]
}

export function TrendingPredictions({ predictions }: TrendingPredictionsProps) {
  if (predictions.length === 0) {
    return null
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-16">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h2 className="text-xl font-bold">Trending Predictions</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {predictions.map((prediction) => (
          <Link
            key={prediction.taskId}
            href={`/searchs/${prediction.taskId}`}
            className="
              bg-zinc-900/50 border border-zinc-800 rounded-lg p-4
              hover:border-emerald-500/50 hover:bg-zinc-900/80
              transition-all duration-200
              group
            "
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors line-clamp-2 flex-1">
                {prediction.title}
              </h3>
              
              {/* 趋势指示器 */}
              <div className={`
                flex-shrink-0 px-2 py-1 rounded text-xs font-mono
                ${prediction.trend === 'up' ? 'bg-green-500/20 text-green-400' :
                  prediction.trend === 'down' ? 'bg-red-500/20 text-red-400' :
                  'bg-zinc-700 text-zinc-400'}
              `}>
                {prediction.trend === 'up' ? '↑' : prediction.trend === 'down' ? '↓' : '→'}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span className="text-emerald-400 font-semibold">
                  {(prediction.consensusProbability * 100).toFixed(0)}%
                </span>
              </div>
              
              <div className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span>{prediction.predictionCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
