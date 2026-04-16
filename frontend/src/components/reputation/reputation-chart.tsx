'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface ReputationHistoryEntry {
  id: number
  agent_id: string
  change_amount: number
  reason: string
  old_score: number
  new_score: number
  old_level: string | null
  new_level: string | null
  created_at: string
}

interface ReputationChartProps {
  history: ReputationHistoryEntry[]
  currentScore: number
}

// Level boundaries for reference lines
const levelBoundaries = [
  { score: 60, label: '见习', color: '#eab308' },
  { score: 100, label: '初级', color: '#00ff88' },
  { score: 200, label: '中级', color: '#00d4ff' },
  { score: 300, label: '高级', color: '#a855f7' },
  { score: 400, label: '专家', color: '#ec4899' },
  { score: 500, label: '大师', color: '#f97316' },
  { score: 1000, label: '传奇', color: '#fbbf24' }
]

// Reason translations
const reasonLabels: Record<string, string> = {
  'submission_correct': '提交正确',  // DB reason key
  'submission_wrong': '提交错误',    // DB reason key
  'streak_bonus': '连胜奖励',
  'calibration_correct': '校准任务正确',
  'calibration_wrong': '校准任务错误',
  'market_settled': '任务结算',
  'level_up': '等级提升',
  'penalty': '惩罚',
  'bonus': '奖励',
  'initial': '初始分数'
}

export default function ReputationChart({
  history,
  currentScore
}: ReputationChartProps) {
  // Prepare chart data
  const chartData = history
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((entry) => ({
      date: new Date(entry.created_at).toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      score: parseFloat(entry.new_score.toString()),
      change: entry.change_amount,
      reason: reasonLabels[entry.reason] || entry.reason,
      oldLevel: entry.old_level,
      newLevel: entry.new_level,
      timestamp: new Date(entry.created_at).getTime()
    }))

  // Find level changes
  const levelChanges = chartData.filter(
    (entry) => entry.oldLevel && entry.newLevel && entry.oldLevel !== entry.newLevel
  )

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-3 shadow-xl">
          <p className="text-sm text-gray-300 mb-1">{data.date}</p>
          <p className="text-lg font-bold text-[#00d4ff] mb-1">
            {data.score.toFixed(0)} 分
          </p>
          <p className={`text-sm font-medium ${
            data.change > 0 ? 'text-green-400' : data.change < 0 ? 'text-red-400' : 'text-gray-400'
          }`}>
            {data.change > 0 ? '+' : ''}{data.change} ({data.reason})
          </p>
          {data.oldLevel !== data.newLevel && data.newLevel && (
            <p className="text-xs text-yellow-400 mt-1">
              🎉 升级到 {data.newLevel}
            </p>
          )}
        </div>
      )
    }
    return null
  }

  // If no history, show empty state
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <div>暂无信誉历史记录</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3f5f" />
          
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            style={{ fontSize: '11px' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            domain={['dataMin - 20', 'dataMax + 20']}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          {/* Level boundary reference lines */}
          {levelBoundaries.map((boundary) => (
            <ReferenceLine
              key={boundary.score}
              y={boundary.score}
              stroke={boundary.color}
              strokeDasharray="3 3"
              strokeOpacity={0.3}
              label={{
                value: boundary.label,
                position: 'right',
                fill: boundary.color,
                fontSize: 10
              }}
            />
          ))}
          
          {/* Main line */}
          <Line
            type="monotone"
            dataKey="score"
            stroke="#00d4ff"
            strokeWidth={3}
            dot={(props: any) => {
              const { cx, cy, payload } = props
              const isLevelChange = payload.oldLevel !== payload.newLevel && payload.newLevel
              
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isLevelChange ? 6 : 4}
                  fill={isLevelChange ? '#fbbf24' : '#00d4ff'}
                  stroke={isLevelChange ? '#f59e0b' : '#0099cc'}
                  strokeWidth={2}
                />
              )
            }}
            activeDot={{ r: 8, fill: '#00ff88' }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Level Change Events */}
      {levelChanges.length > 0 && (
        <div className="border-t border-[#2a3f5f] pt-4">
          <h3 className="text-sm font-bold text-gray-300 mb-3">🎉 等级变化记录</h3>
          <div className="space-y-2">
            {levelChanges.map((change, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-[#0a0e27] border border-[#2a3f5f] rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎊</span>
                  <div>
                    <div className="text-sm font-medium text-gray-200">
                      {change.oldLevel} → {change.newLevel}
                    </div>
                    <div className="text-xs text-gray-400">
                      {change.date}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[#00d4ff]">
                    {change.score.toFixed(0)} 分
                  </div>
                  <div className={`text-xs font-medium ${
                    change.change > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {change.change > 0 ? '+' : ''}{change.change}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 border-t border-[#2a3f5f] pt-4">
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1">当前分数</div>
          <div className="text-xl font-bold text-[#00d4ff]">
            {currentScore.toFixed(0)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1">历史最高</div>
          <div className="text-xl font-bold text-green-400">
            {Math.max(...chartData.map(d => d.score)).toFixed(0)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1">历史最低</div>
          <div className="text-xl font-bold text-red-400">
            {Math.min(...chartData.map(d => d.score)).toFixed(0)}
          </div>
        </div>
      </div>
    </div>
  )
}
