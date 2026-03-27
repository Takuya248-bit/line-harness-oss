import { jstNow } from './utils.js';

export interface BookingRow {
  id: string;
  friend_id: string;
  line_account_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  google_event_id: string | null;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBookingInput {
  friendId: string;
  lineAccountId?: string;
  title?: string;
  startTime: string;
  endTime: string;
  googleEventId?: string;
  note?: string;
}

export async function createBooking(db: D1Database, input: CreateBookingInput): Promise<BookingRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO bookings (id, friend_id, line_account_id, title, start_time, end_time, google_event_id, note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
    )
    .bind(
      id,
      input.friendId,
      input.lineAccountId ?? null,
      input.title ?? 'オンライン面談',
      input.startTime,
      input.endTime,
      input.googleEventId ?? null,
      input.note ?? null,
      now,
      now,
    )
    .run();
  return (await getBookingById(db, id))!;
}

export async function getBookingById(db: D1Database, id: string): Promise<BookingRow | null> {
  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(id).first<BookingRow>();
}

export async function getBookingsByFriend(db: D1Database, friendId: string): Promise<BookingRow[]> {
  const result = await db
    .prepare(`SELECT * FROM bookings WHERE friend_id = ? ORDER BY start_time ASC`)
    .bind(friendId)
    .all<BookingRow>();
  return result.results;
}

export async function getBookingsByDateRange(db: D1Database, start: string, end: string): Promise<BookingRow[]> {
  const result = await db
    .prepare(`SELECT * FROM bookings WHERE start_time >= ? AND start_time < ? AND status != 'cancelled' ORDER BY start_time ASC`)
    .bind(start, end)
    .all<BookingRow>();
  return result.results;
}

export async function getAllBookings(db: D1Database, opts?: { lineAccountId?: string }): Promise<BookingRow[]> {
  if (opts?.lineAccountId) {
    const result = await db
      .prepare(`SELECT * FROM bookings WHERE line_account_id = ? ORDER BY start_time DESC`)
      .bind(opts.lineAccountId)
      .all<BookingRow>();
    return result.results;
  }
  const result = await db.prepare(`SELECT * FROM bookings ORDER BY start_time DESC`).all<BookingRow>();
  return result.results;
}

export async function updateBookingStatus(db: D1Database, id: string, status: string): Promise<BookingRow | null> {
  const now = jstNow();
  await db.prepare(`UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?`).bind(status, now, id).run();
  return getBookingById(db, id);
}

export async function updateBookingGoogleEventId(db: D1Database, id: string, googleEventId: string): Promise<void> {
  const now = jstNow();
  await db.prepare(`UPDATE bookings SET google_event_id = ?, updated_at = ? WHERE id = ?`).bind(googleEventId, now, id).run();
}

export async function cancelBooking(db: D1Database, id: string): Promise<void> {
  const now = jstNow();
  await db.prepare(`UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(now, id).run();
}
