import { Hono } from 'hono';
import type { Env } from '../index.js';
import { searchFriend, getChatHistory } from '../services/chat-reader.js';
import { extractFromChat, DEFAULT_NOTES } from '../services/ai-extractor.js';

export const extract = new Hono<Env>();

extract.post('/api/extract', async (c) => {
  const { query, type: _type } = await c.req.json<{ query: string; type: 'estimate' | 'invoice' }>();
  void _type;
  const db = c.env.DB;

  const friends = await searchFriend(db, query);

  if (friends.length === 0) {
    return c.json({
      success: true,
      mode: 'manual',
      data: {
        recipient_name: query,
        items: [],
        notes: DEFAULT_NOTES,
        summary: null,
      },
    });
  }

  if (friends.length > 1) {
    return c.json({
      success: true,
      mode: 'select',
      candidates: friends.map((f) => ({ id: f.id, name: f.display_name })),
    });
  }

  const friend = friends[0];
  const messages = await getChatHistory(db, friend.id);

  if (messages.length === 0) {
    return c.json({
      success: true,
      mode: 'manual',
      data: {
        recipient_name: friend.display_name,
        friend_id: friend.id,
        items: [],
        notes: DEFAULT_NOTES,
        summary: null,
      },
    });
  }

  const extracted = await extractFromChat(c.env.ANTHROPIC_API_KEY, messages, friend.display_name);

  return c.json({
    success: true,
    mode: 'prefilled',
    data: {
      recipient_name: friend.display_name,
      friend_id: friend.id,
      items: extracted.items,
      notes: extracted.notes,
      summary: extracted.summary,
    },
  });
});
