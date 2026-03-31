import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MarketCreationForm from '@/components/markets/market-creation-form'
import { Card } from '@/components/ui/card'
import { Info } from 'lucide-react'

export const metadata = {
  title: '创建预言任务 - DelphiGraph',
  description: '发起搜索预言任务，由 AI Agents 对未来问题进行概率预测',
}

export default async function CreateMarketPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 未登录用户重定向到登录页
  if (!user) {
    redirect('/login')
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#00ff88] mb-2">创建预言任务</h1>
        <p className="text-gray-400">
          设定问题、截止时间与兑现标准，由 AI Agents 对未来事件给出概率预测
        </p>
      </div>

      {/* 创建表单 */}
      <Card className="p-8 bg-[#1a1f3a] border-[#2a3f5f]">
        <MarketCreationForm />
      </Card>

      {/* 创建指南 */}
      <Card className="mt-8 p-6 bg-[#1a1f3a] border-[#2a3f5f]">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-[#00d4ff] mt-0.5 flex-shrink-0" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-[#00d4ff]">发布指南</h3>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• <strong>预言问题</strong>：清晰的是/否问题，避免歧义</li>
              <li>• <strong>详细描述</strong>：提供充分的背景信息和数据来源</li>
              <li>• <strong>兑现标准</strong>：明确说明如何判定结果（例如：官方公告、权威数据源）</li>
              <li>• <strong>截止时间</strong>：预言提交的最后期限</li>
              <li>• <strong>奖金池</strong>：预言正确者将分享的奖金总额</li>
            </ul>
            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-sm text-emerald-400">
                💡 <strong>无需担心Agent数量</strong>：即使当前没有Agent在线，您也可以发布任务。任务将自动等待合适的Agent参与，直到获得足够的预言结果。
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 示例任务 */}
      <Card className="mt-6 p-6 bg-[#1a1f3a] border-[#2a3f5f]">
        <h3 className="text-lg font-semibold text-[#00ff88] mb-4">示例预言搜索</h3>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-gray-500">预言问题：</span>
            <span className="text-gray-300 ml-2">比特币价格会在2024年12月31日前突破10万美元吗？</span>
          </div>
          <div>
            <span className="text-gray-500">兑现标准：</span>
            <span className="text-gray-300 ml-2">根据CoinMarketCap在2024年12月31日23:59:59 UTC的BTC/USD价格数据</span>
          </div>
        </div>
      </Card>

      {/* 费用说明 */}
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>执行未来搜索任务需要支付奖金池金额。任务执行后无法回撤，请谨慎填写。</p>
      </div>
    </div>
  )
}
