import { useEffect, useState } from 'react';
import { api } from '../api';
import { PostCard } from '../components/PostCard';
import { PostForm } from '../components/PostForm';
import type { Post, PostStatus } from '../types';

const tabs: { label: string; value: PostStatus | 'all' }[] = [
  { label: 'All', value: 'all' }, { label: 'Draft', value: 'draft' },
  { label: 'Pending', value: 'pending_approval' }, { label: 'Approved', value: 'approved' },
  { label: 'Posted', value: 'posted' }, { label: 'Rejected', value: 'rejected' },
];

export function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<PostStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const isAdmin = true; // TODO: detect from Cloudflare Access header

  const load = () => {
    const params: Record<string, string> = {};
    if (tab !== 'all') params.status = tab;
    api.posts.list(params).then(setPosts);
  };

  useEffect(() => { load(); }, [tab]);

  const grouped = posts.reduce<Map<string, Post[]>>((map, post) => {
    const key = post.thread_id || post.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(post);
    return map;
  }, new Map());

  const handleAction = async (action: string, id: string) => {
    if (action === 'submit') { await api.posts.submit(id); load(); }
    else if (action === 'approve') { await api.posts.approve(id); load(); }
    else if (action === 'reject') { setRejectingId(id); }
    else if (action === 'delete') { await api.posts.delete(id); load(); }
  };

  const confirmReject = async () => {
    if (rejectingId) {
      await api.posts.reject(rejectingId, rejectReason);
      setRejectingId(null); setRejectReason(''); load();
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Posts</h1>
        {isAdmin && <button onClick={() => setShowForm(true)} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md">New Post</button>}
      </div>
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`text-sm px-3 py-1 rounded-md ${tab === t.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500'}`}>{t.label}</button>
        ))}
      </div>
      {showForm && (
        <div className="mb-4">
          <PostForm onSubmit={async (data) => { await api.posts.create(data); setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
        </div>
      )}
      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([key, groupPosts]) => {
          const head = groupPosts.find((p) => p.thread_order === 0) || groupPosts[0];
          const children = groupPosts.filter((p) => p.thread_order > 0).sort((a, b) => a.thread_order - b.thread_order);
          return <PostCard key={key} post={head} threadPosts={children.length > 0 ? children : undefined} onAction={handleAction} isAdmin={isAdmin} />;
        })}
      </div>
      {rejectingId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="font-semibold mb-2">Reject Post</h3>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (optional)"
              className="w-full border border-gray-300 rounded-md p-2 text-sm" rows={3} />
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => setRejectingId(null)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
              <button onClick={confirmReject} className="text-sm bg-red-500 text-white px-4 py-1.5 rounded-md">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
