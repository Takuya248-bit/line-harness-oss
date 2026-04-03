import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import { KpiCard } from '../components/KpiCard';
import type { MetricsSummary, PostMetric, FollowerPoint } from '../types';

export function Analytics() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [postMetrics, setPostMetrics] = useState<PostMetric[]>([]);
  const [followers, setFollowers] = useState<FollowerPoint[]>([]);

  useEffect(() => {
    api.metrics.summary(days).then(setSummary).catch(() => {});
    api.metrics.posts(days).then(setPostMetrics).catch(() => {});
    api.followers.list(days).then(setFollowers).catch(() => {});
  }, [days]);

  const followerChange = followers.length >= 2 ? followers[followers.length - 1].count - followers[0].count : 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-sm px-3 py-1 rounded-md ${days === d ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500'}`}>{d}d</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Impressions" value={summary?.total_impressions?.toLocaleString() ?? '-'} />
        <KpiCard label="Likes" value={summary?.total_likes?.toLocaleString() ?? '-'} />
        <KpiCard label="Retweets" value={summary?.total_retweets?.toLocaleString() ?? '-'} />
        <KpiCard label="Follower Change" value={followerChange > 0 ? `+${followerChange}` : String(followerChange)} />
      </div>
      {followers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3">Follower Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={followers.map((f) => ({ date: f.recorded_at.split('T')[0], count: f.count }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Top Posts by Engagement</h2>
        <div className="space-y-2">
          {postMetrics.map((pm, i) => (
            <div key={pm.id} className="flex justify-between items-start border-b border-gray-50 pb-2">
              <div><span className="text-xs text-gray-400 mr-2">#{i + 1}</span>
                <span className="text-sm">{pm.content.slice(0, 80)}{pm.content.length > 80 ? '...' : ''}</span></div>
              <div className="flex gap-3 text-xs text-gray-500 whitespace-nowrap ml-4">
                <span>{pm.likes} likes</span><span>{pm.retweets} RT</span><span>{pm.impressions} imp</span>
              </div>
            </div>
          ))}
          {postMetrics.length === 0 && <p className="text-sm text-gray-400">No data yet</p>}
        </div>
      </div>
    </div>
  );
}
