'use client'

import type { Chat, FriendItem, StatusFilter } from './types'
import { statusConfig, statusFilters, formatDatetime } from './types'

interface ChatListPanelProps {
  chats: Chat[]
  allFriends: FriendItem[]
  selectedChatId: string | null
  selectedFriendId: string | null
  statusFilter: StatusFilter
  loading: boolean
  onStatusFilterChange: (filter: StatusFilter) => void
  onSelectChat: (chatId: string) => void
  onSelectFriend: (friendId: string) => void
}

export default function ChatListPanel({
  chats,
  allFriends,
  selectedChatId,
  selectedFriendId,
  statusFilter,
  loading,
  onStatusFilterChange,
  onSelectChat,
  onSelectFriend,
}: ChatListPanelProps) {
  return (
    <div className={`w-full lg:w-96 lg:flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden ${selectedChatId ? 'hidden lg:flex' : 'flex'}`}>
      {/* Status Filter Tabs */}
      <div className="flex border-b border-gray-200">
        {statusFilters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => onStatusFilterChange(filter.key)}
            className={`flex-1 px-3 py-2.5 min-h-[44px] text-xs font-medium transition-colors ${
              statusFilter === filter.key
                ? 'text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={statusFilter === filter.key ? { backgroundColor: '#06C755' } : undefined}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-100 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-32" />
                    <div className="h-2 bg-gray-100 rounded w-20" />
                  </div>
                  <div className="h-5 bg-gray-100 rounded-full w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {chats.map((chat) => {
              const statusInfo = statusConfig[chat.status]
              const isSelected = selectedChatId === chat.id
              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                    isSelected && !selectedFriendId ? 'bg-green-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {chat.friendPictureUrl ? (
                      <img src={chat.friendPictureUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-500 text-sm">{chat.friendName.charAt(0)}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{chat.friendName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDatetime(chat.lastMessageAt)}</p>
                    </div>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusInfo.className}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </button>
              )
            })}
            {/* Friends without chats */}
            {allFriends
              .filter((f) => f.isFollowing && !chats.some((c) => c.friendId === f.id))
              .map((friend) => {
                const isSelected = selectedFriendId === friend.id
                return (
                  <button
                    key={friend.id}
                    onClick={() => onSelectFriend(friend.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {friend.pictureUrl ? (
                        <img src={friend.pictureUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-500 text-sm">{(friend.displayName || '?').charAt(0)}</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{friend.displayName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">会話なし</p>
                      </div>
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-gray-100 text-gray-500">
                        新規
                      </span>
                    </div>
                  </button>
                )
              })}
          </>
        )}
      </div>
    </div>
  )
}
