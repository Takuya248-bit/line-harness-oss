import { StatusBadge } from './StatusBadge';
import type { Post } from '../types';

interface Props {
  post: Post;
  threadPosts?: Post[];
  onAction?: (action: string, id: string) => void;
  isAdmin: boolean;
}

export function PostCard({ post, threadPosts, onAction, isAdmin }: Props) {
  const isThread = threadPosts && threadPosts.length > 0;
  const allPosts = isThread ? [post, ...threadPosts] : [post];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <StatusBadge status={post.status} />
        {isThread && <span className="text-xs text-gray-400">Thread ({allPosts.length} tweets)</span>}
      </div>
      {allPosts.map((p, i) => (
        <div key={p.id} className={`${i > 0 ? 'ml-4 border-l-2 border-gray-100 pl-3 mt-2' : ''}`}>
          {isThread && <span className="text-xs text-gray-300">{i + 1}/{allPosts.length}</span>}
          <p className="text-sm mt-0.5 whitespace-pre-wrap">{p.content}</p>
        </div>
      ))}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">{post.scheduled_at ? `Scheduled: ${post.scheduled_at}` : 'No schedule'}</span>
        <div className="flex gap-2">
          {isAdmin && post.status === 'draft' && (
            <>
              <button onClick={() => onAction?.('edit', post.id)} className="text-xs text-blue-600 hover:underline">Edit</button>
              <button onClick={() => onAction?.('submit', post.id)} className="text-xs text-green-600 hover:underline">Submit</button>
              <button onClick={() => onAction?.('delete', post.id)} className="text-xs text-red-500 hover:underline">Delete</button>
            </>
          )}
          {post.status === 'pending_approval' && (
            <>
              <button onClick={() => onAction?.('approve', post.id)} className="text-xs bg-green-500 text-white px-3 py-1 rounded">Approve</button>
              <button onClick={() => onAction?.('reject', post.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded">Reject</button>
            </>
          )}
          {isAdmin && post.status === 'rejected' && (
            <button onClick={() => onAction?.('edit', post.id)} className="text-xs text-blue-600 hover:underline">Edit & Resubmit</button>
          )}
        </div>
      </div>
      {post.rejection_reason && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">Rejection reason: {post.rejection_reason}</div>
      )}
    </div>
  );
}
