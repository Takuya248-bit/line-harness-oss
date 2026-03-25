'use client'

import React from 'react'
import type { Chat, ChatDetail, FriendItem } from './types'
import { statusConfig } from './types'
import DirectMessagePanel from './direct-message-panel'

interface ChatDetailPanelProps {
  selectedChatId: string | null
  selectedFriendId: string | null
  chatDetail: ChatDetail | null
  allFriends: FriendItem[]
  detailLoading: boolean
  messageContent: string
  sending: boolean
  notes: string
  savingNotes: boolean
  onDeselectChat: () => void
  onDeselectFriend: () => void
  onMessageContentChange: (value: string) => void
  onSendMessage: () => void
  onStatusUpdate: (status: Chat['status']) => void
  onNotesChange: (value: string) => void
  onSaveNotes: () => void
  onDirectMessageSent: () => void
}

export default function ChatDetailPanel({
  selectedChatId,
  selectedFriendId,
  chatDetail,
  allFriends,
  detailLoading,
  messageContent,
  sending,
  notes,
  savingNotes,
  onDeselectChat,
  onDeselectFriend,
  onMessageContentChange,
  onSendMessage,
  onStatusUpdate,
  onNotesChange,
  onSaveNotes,
  onDirectMessageSent,
}: ChatDetailPanelProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSendMessage()
    }
  }

  return (
    <div className={`flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden ${selectedChatId || selectedFriendId ? 'flex' : 'hidden lg:flex'}`}>
      {selectedFriendId && !selectedChatId ? (
        <DirectMessagePanel
          friendId={selectedFriendId}
          friend={allFriends.find((f) => f.id === selectedFriendId) || null}
          onBack={() => onDeselectFriend()}
          onSent={onDirectMessageSent}
        />
      ) : !selectedChatId ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">チャットを選択してください</p>
        </div>
      ) : detailLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">読み込み中...</p>
        </div>
      ) : chatDetail ? (
        <>
          {/* Chat Header */}
          <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={onDeselectChat}
                className="lg:hidden flex-shrink-0 p-1 -ml-1 text-gray-500 hover:text-gray-700"
                aria-label="戻る"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {chatDetail.friendPictureUrl && (
                <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {chatDetail.friendName}
                </p>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${statusConfig[chatDetail.status].className}`}
                >
                  {statusConfig[chatDetail.status].label}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {chatDetail.status !== 'unread' && (
                <button
                  onClick={() => onStatusUpdate('unread')}
                  className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                >
                  未読に戻す
                </button>
              )}
              {chatDetail.status !== 'in_progress' && (
                <button
                  onClick={() => onStatusUpdate('in_progress')}
                  className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-md transition-colors"
                >
                  対応中にする
                </button>
              )}
              {chatDetail.status !== 'resolved' && (
                <button
                  onClick={() => onStatusUpdate('resolved')}
                  className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
                >
                  解決済にする
                </button>
              )}
            </div>
          </div>

          {/* Messages -- LINE-style chat bubbles */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: '#7494C0' }}>
            {(!chatDetail.messages || chatDetail.messages.length === 0) ? (
              <div className="text-center py-8">
                <p className="text-white/60 text-sm">メッセージはまだありません。</p>
              </div>
            ) : (
              (chatDetail.messages ?? []).map((msg) => {
                const isOutgoing = msg.direction === 'outgoing'

                let bubbleContent: React.ReactNode
                if (msg.messageType === 'flex') {
                  let formatted = msg.content
                  try {
                    formatted = JSON.stringify(JSON.parse(msg.content), null, 2)
                  } catch { /* use raw */ }
                  bubbleContent = (
                    <div className="max-w-[300px]">
                      <div className="text-xs font-medium mb-1 opacity-70">Flex Message</div>
                      <pre className="text-xs overflow-x-auto whitespace-pre-wrap bg-black/10 rounded p-2 max-h-[200px] overflow-y-auto" style={{ fontSize: '10px' }}>
                        {formatted}
                      </pre>
                    </div>
                  )
                } else if (msg.messageType === 'image') {
                  try {
                    const parsed = JSON.parse(msg.content)
                    bubbleContent = (
                      <img src={parsed.originalContentUrl || parsed.previewImageUrl} alt="" className="max-w-[200px] rounded" />
                    )
                  } catch {
                    bubbleContent = <span>[画像]</span>
                  }
                } else {
                  bubbleContent = <span>{msg.content}</span>
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isOutgoing && (
                      chatDetail.friendPictureUrl ? (
                        <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 mb-1" />
                      )
                    )}

                    <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[320px] px-3 py-2 text-sm break-words whitespace-pre-wrap ${
                          isOutgoing
                            ? 'rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl text-white'
                            : 'rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl bg-white text-gray-900'
                        }`}
                        style={isOutgoing ? { backgroundColor: '#06C755' } : undefined}
                      >
                        {bubbleContent}
                      </div>
                      <span className="text-xs text-white/50 mt-0.5 px-1">
                        {new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Notes */}
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="メモを入力..."
                className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <button
                onClick={onSaveNotes}
                disabled={savingNotes}
                className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
              >
                {savingNotes ? '保存中...' : 'メモ保存'}
              </button>
            </div>
          </div>

          {/* Send Message Form */}
          <div className="px-4 py-3 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={messageContent}
                onChange={(e) => onMessageContentChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={onSendMessage}
                disabled={sending || !messageContent.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#06C755' }}
              >
                {sending ? '送信中...' : '送信'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
