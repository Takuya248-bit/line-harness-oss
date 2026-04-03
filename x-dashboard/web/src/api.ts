import type { Post, MetricsSummary, PostMetric, FollowerPoint } from './types';

const BASE = '/api';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  posts: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return fetchJson<Post[]>(`/posts${qs}`);
    },
    create: (body: { content: string; media_urls?: string[]; scheduled_at?: string; thread_items?: { content: string }[] }) =>
      fetchJson<{ id: string }>('/posts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: { content?: string; scheduled_at?: string }) =>
      fetchJson('/posts/' + id, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => fetchJson('/posts/' + id, { method: 'DELETE' }),
    submit: (id: string) => fetchJson(`/posts/${id}/submit`, { method: 'POST' }),
    approve: (id: string) => fetchJson(`/posts/${id}/approve`, { method: 'POST' }),
    reject: (id: string, reason?: string) =>
      fetchJson(`/posts/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },
  metrics: {
    summary: (days = 7) => fetchJson<MetricsSummary>(`/metrics/summary?days=${days}`),
    posts: (days = 7) => fetchJson<PostMetric[]>(`/metrics/posts?days=${days}`),
  },
  followers: {
    list: (days = 30) => fetchJson<FollowerPoint[]>(`/followers?days=${days}`),
  },
  calendar: {
    get: (month: string) => fetchJson<{ posts: Post[]; threadChildren: Post[] }>(`/calendar?month=${month}`),
  },
};
