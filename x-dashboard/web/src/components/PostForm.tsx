import { useState } from 'react';

interface ThreadItem { content: string; }

interface Props {
  onSubmit: (data: { content: string; scheduled_at?: string; thread_items?: ThreadItem[] }) => void;
  onCancel: () => void;
  initial?: { content: string; scheduled_at?: string };
}

export function PostForm({ onSubmit, onCancel, initial }: Props) {
  const [content, setContent] = useState(initial?.content ?? '');
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduled_at ?? '');
  const [threadItems, setThreadItems] = useState<ThreadItem[]>([]);

  const addThread = () => setThreadItems([...threadItems, { content: '' }]);
  const removeThread = (i: number) => setThreadItems(threadItems.filter((_, idx) => idx !== i));
  const updateThread = (i: number, val: string) => {
    const items = [...threadItems];
    items[i] = { content: val };
    setThreadItems(items);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ content, scheduled_at: scheduledAt || undefined, thread_items: threadItems.length > 0 ? threadItems : undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div>
        <label className="text-sm font-medium text-gray-700">Tweet 1</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)}
          className="w-full border border-gray-300 rounded-md p-2 text-sm mt-1" rows={3} maxLength={280} required />
        <div className="text-xs text-gray-400 text-right">{content.length}/280</div>
      </div>
      {threadItems.map((item, i) => (
        <div key={i}>
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-700">Tweet {i + 2}</label>
            <button type="button" onClick={() => removeThread(i)} className="text-xs text-red-500">Remove</button>
          </div>
          <textarea value={item.content} onChange={(e) => updateThread(i, e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm mt-1" rows={3} maxLength={280} required />
          <div className="text-xs text-gray-400 text-right">{item.content.length}/280</div>
        </div>
      ))}
      <button type="button" onClick={addThread} className="text-sm text-blue-600 hover:underline">+ Add tweet to thread</button>
      <div>
        <label className="text-sm font-medium text-gray-700">Schedule</label>
        <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full border border-gray-300 rounded-md p-2 text-sm mt-1" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
        <button type="submit" className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md">Save Draft</button>
      </div>
    </form>
  );
}
