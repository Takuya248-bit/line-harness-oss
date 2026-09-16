'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

const BALILINGUAL_LINE_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8'

type ParallelStatus = {
  line_account_id: string
  friends_total: number
  friends_added_today: number
  messages_log_count_24h: {
    total: number
    incoming: number
    outgoing: number
  }
  automation_active_count: number
  scenario_active_count: number
  lstep_forward_url_set: boolean
  parallel_mode_active: boolean
}

type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

export default function BalilingualParallelPage() {
  const [status, setStatus] = useState<ParallelStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchApi<ApiResponse<ParallelStatus>>('/api/balilingual/parallel-status')
      if (!res.success) throw new Error(res.error ?? 'parallel status load failed')
      setStatus(res.data)
      setLastLoadedAt(new Date())
    } catch (err) {
      console.error('Balilingual parallel status load error:', err)
      setError(err instanceof Error ? err.message : 'データ取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [load])

  const isNormal = useMemo(() => {
    if (!status) return false
    return (
      status.line_account_id === BALILINGUAL_LINE_ACCOUNT_ID &&
      status.automation_active_count === 0 &&
      status.scenario_active_count === 0 &&
      status.lstep_forward_url_set &&
      status.parallel_mode_active
    )
  }, [status])

  return (
    <div>
      <Header
        title="バリリンガル並走mode"
        description="friends / messages_log / Lステップ転送 / harness mute状態"
        action={
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            更新
          </button>
        }
      />

      {loading && !status ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      ) : status ? (
        <div className="space-y-6">
          <div className={`rounded-xl border p-5 ${isNormal ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-lg font-bold ${isNormal ? 'text-green-800' : 'text-red-800'}`}>
                  {isNormal ? '並走mode正常' : '⚠ 異常'}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  account_id: <span className="font-mono">{status.line_account_id}</span>
                </p>
              </div>
              {lastLoadedAt && (
                <p className="text-xs text-gray-500">
                  最終更新: {lastLoadedAt.toLocaleString('ja-JP')}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label="友だち総数" value={status.friends_total} />
            <SummaryCard label="本日追加" value={status.friends_added_today} />
            <SummaryCard
              label="messages_log 24h"
              value={status.messages_log_count_24h.total}
              sub={`受信: ${status.messages_log_count_24h.incoming} / 送信: ${status.messages_log_count_24h.outgoing}`}
            />
            <SummaryCard
              label="harness有効数"
              value={status.automation_active_count + status.scenario_active_count}
              sub={`automation: ${status.automation_active_count} / scenario: ${status.scenario_active_count}`}
              danger={status.automation_active_count + status.scenario_active_count > 0}
            />
          </div>

          <Section title="並走チェック">
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckRow label="Lステップ転送URL" ok={status.lstep_forward_url_set} okText="設定済み" ngText="未設定" />
              <CheckRow label="parallel mode" ok={status.parallel_mode_active} okText="有効" ngText="無効" />
              <CheckRow label="automation mute" ok={status.automation_active_count === 0} okText="有効0件" ngText={`${status.automation_active_count}件 有効`} />
              <CheckRow label="scenario mute" ok={status.scenario_active_count === 0} okText="有効0件" ngText={`${status.scenario_active_count}件 有効`} />
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  )
}

function SummaryCard({ label, value, sub, danger = false }: { label: string; value: number; sub?: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-5 ${danger ? 'border-red-200' : 'border-gray-200'}`}>
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${danger ? 'text-red-700' : 'text-gray-900'}`}>{value.toLocaleString()}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-base font-bold text-gray-900">{title}</h2>
      {children}
    </div>
  )
}

function CheckRow({ label, ok, okText, ngText }: { label: string; ok: boolean; okText: string; ngText: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {ok ? okText : ngText}
      </span>
    </div>
  )
}
