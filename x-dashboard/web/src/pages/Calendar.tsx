import { useEffect, useState } from 'react';
import { api } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import type { Post } from '../types';

function getMonthString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<Post[]>([]);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthStr = getMonthString(currentDate);

  useEffect(() => { api.calendar.get(monthStr).then((data) => setPosts(data.posts)).catch(() => {}); }, [monthStr]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const postsByDay = posts.reduce<Record<number, Post[]>>((acc, p) => {
    if (!p.scheduled_at) return acc;
    const day = new Date(p.scheduled_at).getDate();
    if (!acc[day]) acc[day] = [];
    acc[day].push(p);
    return acc;
  }, {});

  const prev = () => setCurrentDate(new Date(year, month - 2, 1));
  const next = () => setCurrentDate(new Date(year, month, 1));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Calendar</h1>
        <div className="flex items-center gap-3">
          <button onClick={prev} className="text-gray-500 hover:text-gray-800">&lt;</button>
          <span className="font-medium">{year}/{String(month).padStart(2, '0')}</span>
          <button onClick={next} className="text-gray-500 hover:text-gray-800">&gt;</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-gray-50 text-center text-xs font-medium text-gray-500 py-2">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-white p-2 min-h-[80px]" />
        ))}
        {days.map((day) => (
          <div key={day} className="bg-white p-2 min-h-[80px]">
            <div className="text-xs text-gray-400 mb-1">{day}</div>
            <div className="space-y-1">
              {(postsByDay[day] || []).map((p) => (
                <div key={p.id} className="text-xs truncate">
                  <StatusBadge status={p.status} />
                  <span className="ml-1">{p.content.slice(0, 20)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
