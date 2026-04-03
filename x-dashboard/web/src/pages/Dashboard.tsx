import { useEffect, useState } from 'react';
import { api } from '../api';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge } from '../components/StatusBadge';
import type { Post, MetricsSummary } from '../types';

export function Dashboard() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [recent, setRecent] = useState<Post[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.metrics.summary(7).then(setSummary).catch(() => {});
    api.posts.list().then((posts) => {
      setRecent(posts.slice(0, 5));
      setPendingCount(posts.filter((p) => p.status === 'pending_approval').length);
    }).catch(() => {});
  }, []);

  const engRate = summary && summary.total_impressions > 0
    ? (((summary.total_likes + summary.total_retweets + summary.total_replies) / summary.total_impressions) * 100).toFixed(2) : '0';

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Impressions (7d)" value={summary?.total_impressions?.toLocaleString() ?? '-'} />
        <KpiCard label="Engagement Rate" value={`${engRate}%`} />
        <KpiCard label="Likes (7d)" value={summary?.total_likes?.toLocaleString() ?? '-'} />
        <KpiCard label="Pending Approval" value={pendingCount} />
      </div>
      <h2 className="text-lg font-semibold mb-3">Recent Posts</h2>
      <div className="space-y-2">
        {recent.map((post) => (
          <div key={post.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-start">
            <div>
              <p className="text-sm whitespace-pre-wrap">{post.content.slice(0, 100)}{post.content.length > 100 ? '...' : ''}</p>
              <p className="text-xs text-gray-400 mt-1">{post.scheduled_at || post.created_at}</p>
            </div>
            <StatusBadge status={post.status} />
          </div>
        ))}
        {recent.length === 0 && <p className="text-gray-400 text-sm">No posts yet</p>}
      </div>
    </div>
  );
}
