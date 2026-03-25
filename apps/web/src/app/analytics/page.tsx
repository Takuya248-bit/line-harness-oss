'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'

type OverviewData = {
  friendsTotal: number
  friendsFollowing: number
  messages: { total: number; incoming: number; outgoing: number }
  broadcasts: { count: number; delivered: number }
  friendTrend: { date: string; count: number }[]
  days: number
}

type MessageRow = {
  date: string
  incoming: number
  outgoing: number
  total: number
}

type AutomationRow = {
  id: string
  name: string
  eventType: string
  keyword: string | null
  matchType: string | null
  hitCount: number
  successCount: number
  failedCount: number
}

type ScenarioRow = {
  id: string
  name: string
  isActive: boolean
  enrolledCount: number
  completedCount: number
  activeCount: number
  pausedCount: number
  completionRate: number
}

const periodOptions = [
  { value: 7, label: '7日間' },
  { value: 14, label: '14日間' },
  { value: 30, label: '30日間' },
  { value: 90, label: '90日間' },
]

export default function AnalyticsPage() {
  const { selectedAccount } = useAccount()
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [automations, setAutomations] = useState<AutomationRow[]>([])
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const accountId = selectedAccount?.id
      const [ovRes, msgRes, autoRes, scRes] = await Promise.all([
        api.analytics.overview({ days, accountId }),
        api.analytics.messages({ days }),
        api.analytics.automations({ days }),
        api.analytics.scenarios({ accountId }),
      ])
      if (ovRes.success) setOverview(ovRes.data)
      if (msgRes.success) setMessages(msgRes.data)
      if (autoRes.success) setAutomations(autoRes.data)
      if (scRes.success) setScenarios(scRes.data)
    } catch (err) {
      console.error('Analytics load error:', err)
    } finally {
      setLoading(false)
    }
  }, [days, selectedAccount?.id])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <Header
        title="アナリティクス"
        description="友だち数推移、メッセージ数、自動応答ヒット数、シナリオ完了率"
        action={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* サマリーカード */}
          {overview && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="友だち総数" value={overview.friendsTotal} sub={`フォロー中: ${overview.friendsFollowing}`} />
              <SummaryCard label="メッセージ数" value={overview.messages.total} sub={`受信: ${overview.messages.incoming} / 送信: ${overview.messages.outgoing}`} />
              <SummaryCard label="一斉配信" value={overview.broadcasts.count} sub={`配信済: ${overview.broadcasts.delivered}通`} />
              <SummaryCard
                label="新規友だち"
                value={overview.friendTrend.reduce((s, r) => s + r.count, 0)}
                sub={`直近${overview.days}日間`}
              />
            </div>
          )}

          {/* 友だち数推移テーブル */}
          {overview && overview.friendTrend.length > 0 && (
            <Section title="友だち追加推移">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">日付</th>
                    <th className="py-2 pr-4 font-medium text-right">新規追加数</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.friendTrend.map((row) => (
                    <tr key={row.date} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-700">{row.date}</td>
                      <td className="py-2 pr-4 text-right font-mono text-gray-900">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* 日別メッセージ数テーブル */}
          {messages.length > 0 && (
            <Section title="日別メッセージ数">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">日付</th>
                    <th className="py-2 pr-4 font-medium text-right">受信</th>
                    <th className="py-2 pr-4 font-medium text-right">送信</th>
                    <th className="py-2 pr-4 font-medium text-right">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((row) => (
                    <tr key={row.date} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-700">{row.date}</td>
                      <td className="py-2 pr-4 text-right font-mono text-blue-600">{row.incoming}</td>
                      <td className="py-2 pr-4 text-right font-mono text-green-600">{row.outgoing}</td>
                      <td className="py-2 pr-4 text-right font-mono text-gray-900">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* キーワード別ヒット数ランキング */}
          {automations.length > 0 && (
            <Section title="自動応答ヒット数ランキング">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">#</th>
                    <th className="py-2 pr-4 font-medium">ルール名</th>
                    <th className="py-2 pr-4 font-medium">キーワード</th>
                    <th className="py-2 pr-4 font-medium text-right">ヒット数</th>
                    <th className="py-2 pr-4 font-medium text-right">成功</th>
                    <th className="py-2 pr-4 font-medium text-right">失敗</th>
                  </tr>
                </thead>
                <tbody>
                  {automations.map((row, i) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-4 text-gray-900">{row.name}</td>
                      <td className="py-2 pr-4">
                        {row.keyword ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs">
                            {row.matchType === 'exact' ? '完全一致' : '部分一致'}: {row.keyword}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-gray-900">{row.hitCount}</td>
                      <td className="py-2 pr-4 text-right font-mono text-green-600">{row.successCount}</td>
                      <td className="py-2 pr-4 text-right font-mono text-red-500">{row.failedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* シナリオ完了率 */}
          {scenarios.length > 0 && (
            <Section title="シナリオ完了率">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">シナリオ名</th>
                    <th className="py-2 pr-4 font-medium">状態</th>
                    <th className="py-2 pr-4 font-medium text-right">登録数</th>
                    <th className="py-2 pr-4 font-medium text-right">完了</th>
                    <th className="py-2 pr-4 font-medium text-right">進行中</th>
                    <th className="py-2 pr-4 font-medium text-right">完了率</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-900">{row.name}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                          row.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {row.isActive ? '有効' : '無効'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-gray-900">{row.enrolledCount}</td>
                      <td className="py-2 pr-4 text-right font-mono text-green-600">{row.completedCount}</td>
                      <td className="py-2 pr-4 text-right font-mono text-blue-600">{row.activeCount}</td>
                      <td className="py-2 pr-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${row.completionRate}%`,
                                backgroundColor: row.completionRate >= 70 ? '#22c55e' : row.completionRate >= 40 ? '#eab308' : '#ef4444',
                              }}
                            />
                          </div>
                          <span className="font-mono text-gray-900">{row.completionRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* データなし */}
          {!overview && messages.length === 0 && automations.length === 0 && scenarios.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              データがありません
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-bold text-gray-900 mb-4">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}
