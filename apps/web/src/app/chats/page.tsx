'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import ChatListPanel from '@/components/chats/chat-list-panel'
import ChatDetailPanel from '@/components/chats/chat-detail-panel'
import type { Chat, ChatDetail, StatusFilter, FriendItem } from '@/components/chats/types'

const ccPrompts = [
  {
    title: 'チャット対応テンプレート',
    prompt: `チャット対応で使えるテンプレートメッセージを作成してください。
1. よくある質問への回答テンプレート（挨拶、FAQ、サポート）
2. クレーム対応用の丁寧な返信テンプレート
3. フォローアップメッセージのテンプレート
手順を示してください。`,
  },
  {
    title: '未対応チャット確認',
    prompt: `未対応のチャットを確認し、対応優先度を整理してください。
1. 未読・対応中のチャット数を集計
2. 最終メッセージからの経過時間で優先度を判定
3. 長時間未対応のチャットへの対応アクションを提案
結果をレポートしてください。`,
  },
]

export default function ChatsPage() {
  const { selectedAccountId } = useAccount()
  const [chats, setChats] = useState<Chat[]>([])
  const [allFriends, setAllFriends] = useState<FriendItem[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [messageContent, setMessageContent] = useState('')
  const [sending, setSending] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const loadChats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: { status?: string; accountId?: string } = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (selectedAccountId) params.accountId = selectedAccountId
      const [chatRes, friendRes] = await Promise.allSettled([
        api.chats.list(params),
        api.friends.list({ accountId: selectedAccountId || undefined, limit: '100' }),
      ])
      if (chatRes.status === 'fulfilled' && chatRes.value.success) {
        setChats(chatRes.value.data as unknown as Chat[])
      }
      if (friendRes.status === 'fulfilled' && friendRes.value.success) {
        setAllFriends((friendRes.value.data as unknown as { items: FriendItem[] }).items)
      }
    } catch {
      setError('チャットの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, selectedAccountId])

  const loadChatDetail = useCallback(async (chatId: string) => {
    setDetailLoading(true)
    try {
      const res = await api.chats.get(chatId)
      if (res.success) {
        setChatDetail(res.data as unknown as ChatDetail)
        setNotes((res.data as unknown as ChatDetail).notes || '')
      }
    } catch {
      setError('チャット詳細の読み込みに失敗しました。')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    loadChats()
  }, [loadChats])

  useEffect(() => {
    if (selectedChatId) {
      loadChatDetail(selectedChatId)
    } else {
      setChatDetail(null)
    }
  }, [selectedChatId, loadChatDetail])

  const handleSelectChat = (chatId: string) => {
    setSelectedFriendId(null)
    setSelectedChatId(chatId)
    setMessageContent('')
  }

  const handleSelectFriend = (friendId: string) => {
    setSelectedChatId(null)
    setChatDetail(null)
    setSelectedFriendId(friendId)
  }

  const handleStatusFilterChange = (filter: StatusFilter) => {
    setStatusFilter(filter)
    setSelectedChatId(null)
  }

  const handleSendMessage = async () => {
    if (!selectedChatId || !messageContent.trim()) return
    setSending(true)
    try {
      await api.chats.send(selectedChatId, { content: messageContent.trim() })
      setMessageContent('')
      loadChatDetail(selectedChatId)
      loadChats()
    } catch {
      setError('メッセージの送信に失敗しました。')
    } finally {
      setSending(false)
    }
  }

  const handleStatusUpdate = async (newStatus: Chat['status']) => {
    if (!selectedChatId) return
    try {
      await api.chats.update(selectedChatId, { status: newStatus })
      loadChatDetail(selectedChatId)
      loadChats()
    } catch {
      setError('ステータスの更新に失敗しました。')
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedChatId) return
    setSavingNotes(true)
    try {
      await api.chats.update(selectedChatId, { notes })
      loadChatDetail(selectedChatId)
    } catch {
      setError('メモの保存に失敗しました。')
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <div>
      <Header title="オペレーターチャット" />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-120px)] lg:h-[calc(100vh-180px)]">
        <ChatListPanel
          chats={chats}
          allFriends={allFriends}
          selectedChatId={selectedChatId}
          selectedFriendId={selectedFriendId}
          statusFilter={statusFilter}
          loading={loading}
          onStatusFilterChange={handleStatusFilterChange}
          onSelectChat={handleSelectChat}
          onSelectFriend={handleSelectFriend}
        />

        <ChatDetailPanel
          selectedChatId={selectedChatId}
          selectedFriendId={selectedFriendId}
          chatDetail={chatDetail}
          allFriends={allFriends}
          detailLoading={detailLoading}
          messageContent={messageContent}
          sending={sending}
          notes={notes}
          savingNotes={savingNotes}
          onDeselectChat={() => setSelectedChatId(null)}
          onDeselectFriend={() => setSelectedFriendId(null)}
          onMessageContentChange={setMessageContent}
          onSendMessage={handleSendMessage}
          onStatusUpdate={handleStatusUpdate}
          onNotesChange={setNotes}
          onSaveNotes={handleSaveNotes}
          onDirectMessageSent={() => { setSelectedFriendId(null); loadChats() }}
        />
      </div>
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
