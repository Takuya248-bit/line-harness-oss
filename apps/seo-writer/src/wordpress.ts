import type { Env, WPPostResponse } from './types';

function getAuthHeader(env: Env): string {
  return 'Basic ' + btoa(`${env.WP_USER}:${env.WP_APP_PASSWORD}`);
}

export async function createDraftPost(
  env: Env,
  title: string,
  content: string,
  slug: string,
  excerpt: string,
  categoryIds?: number[],
  tagIds?: number[]
): Promise<WPPostResponse> {
  const url = `${env.WP_URL}/wp-json/wp/v2/posts`;

  const body: Record<string, unknown> = {
    title,
    content,
    slug,
    excerpt,
    status: 'draft',
  };

  if (categoryIds?.length) body.categories = categoryIds;
  if (tagIds?.length) body.tags = tagIds;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(env),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<WPPostResponse>;
}

export async function publishPost(env: Env, postId: number): Promise<WPPostResponse> {
  const url = `${env.WP_URL}/wp-json/wp/v2/posts/${postId}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(env),
    },
    body: JSON.stringify({ status: 'publish' }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress publish error (${response.status}): ${error}`);
  }

  return response.json() as Promise<WPPostResponse>;
}

export async function getCategories(env: Env): Promise<Array<{ id: number; name: string; slug: string }>> {
  const url = `${env.WP_URL}/wp-json/wp/v2/categories?per_page=100`;

  const response = await fetch(url, {
    headers: { Authorization: getAuthHeader(env) },
  });

  if (!response.ok) throw new Error(`WP categories error: ${response.status}`);
  return response.json() as Promise<Array<{ id: number; name: string; slug: string }>>;
}
