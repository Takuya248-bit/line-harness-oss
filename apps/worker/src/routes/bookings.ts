import { Hono } from 'hono';
import {
  createBooking,
  getAllBookings,
  getBookingById,
  getBookingsByDateRange,
  updateBookingStatus,
  updateBookingGoogleEventId,
  cancelBooking,
  getFriendByLineUserId,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import { getAccessToken, getAvailableSlots, createCalendarEvent, deleteCalendarEvent } from '../services/google-calendar-sa.js';
import { buildAvailableSlotsFlex, buildBookingConfirmFlex } from '../services/booking-flex.js';
import { buildMessage } from '../services/step-delivery.js';
import type { Env } from '../index.js';

const bookings = new Hono<Env>();

// GET /api/bookings - list all bookings
bookings.get('/api/bookings', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    const items = await getAllBookings(c.env.DB, { lineAccountId: lineAccountId ?? undefined });
    return c.json({
      success: true,
      data: items.map((b) => ({
        id: b.id,
        friendId: b.friend_id,
        lineAccountId: b.line_account_id,
        title: b.title,
        startTime: b.start_time,
        endTime: b.end_time,
        googleEventId: b.google_event_id,
        status: b.status,
        note: b.note,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/bookings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/bookings/available - get available slots for a date
bookings.get('/api/bookings/available', async (c) => {
  try {
    const date = c.req.query('date');
    if (!date) return c.json({ success: false, error: 'date is required (YYYY-MM-DD)' }, 400);

    const env = c.env;
    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_CALENDAR_ID) {
      return c.json({ success: false, error: 'Google Calendar not configured' }, 503);
    }

    const accessToken = await getAccessToken({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_SERVICE_ACCOUNT_KEY: env.GOOGLE_SERVICE_ACCOUNT_KEY,
      GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
    });

    const slots = await getAvailableSlots(
      accessToken,
      env.GOOGLE_CALENDAR_ID,
      date,
      14, // startHour
      21, // endHour
      60, // slotMinutes
    );

    return c.json({ success: true, data: slots });
  } catch (err) {
    console.error('GET /api/bookings/available error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/bookings - create a booking (admin)
bookings.post('/api/bookings', async (c) => {
  try {
    const body = await c.req.json<{
      friendId: string;
      lineAccountId?: string;
      title?: string;
      startTime: string;
      endTime: string;
      note?: string;
    }>();

    if (!body.friendId || !body.startTime || !body.endTime) {
      return c.json({ success: false, error: 'friendId, startTime, endTime are required' }, 400);
    }

    const booking = await createBooking(c.env.DB, body);

    // Create Google Calendar event if configured
    const env = c.env;
    if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_KEY && env.GOOGLE_CALENDAR_ID) {
      try {
        const accessToken = await getAccessToken({
          GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          GOOGLE_SERVICE_ACCOUNT_KEY: env.GOOGLE_SERVICE_ACCOUNT_KEY,
          GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
        });
        const { id: eventId } = await createCalendarEvent(accessToken, env.GOOGLE_CALENDAR_ID, {
          summary: booking.title,
          start: booking.start_time,
          end: booking.end_time,
          description: booking.note ?? undefined,
        });
        await updateBookingGoogleEventId(c.env.DB, booking.id, eventId);
        booking.google_event_id = eventId;
      } catch (err) {
        console.warn('Google Calendar createEvent error (booking still created in DB):', err);
      }
    }

    return c.json({ success: true, data: booking }, 201);
  } catch (err) {
    console.error('POST /api/bookings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/bookings/:id - update booking
bookings.put('/api/bookings/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json<{ status: string }>();
    if (!status) return c.json({ success: false, error: 'status is required' }, 400);

    const updated = await updateBookingStatus(c.env.DB, id, status);
    if (!updated) return c.json({ success: false, error: 'Booking not found' }, 404);

    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/bookings/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/bookings/:id - cancel booking
bookings.delete('/api/bookings/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const booking = await getBookingById(c.env.DB, id);
    if (!booking) return c.json({ success: false, error: 'Booking not found' }, 404);

    // Delete from Google Calendar if event exists
    if (booking.google_event_id) {
      const env = c.env;
      if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_KEY && env.GOOGLE_CALENDAR_ID) {
        try {
          const accessToken = await getAccessToken({
            GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            GOOGLE_SERVICE_ACCOUNT_KEY: env.GOOGLE_SERVICE_ACCOUNT_KEY,
            GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
          });
          await deleteCalendarEvent(accessToken, env.GOOGLE_CALENDAR_ID, booking.google_event_id);
        } catch (err) {
          console.warn('Google Calendar deleteEvent error:', err);
        }
      }
    }

    await cancelBooking(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/bookings/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/bookings/send-slots - send today's available slots to a friend via LINE
bookings.post('/api/bookings/send-slots', async (c) => {
  try {
    const body = await c.req.json<{ friendId?: string; lineUserId?: string; date?: string }>();
    const env = c.env;

    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_CALENDAR_ID) {
      return c.json({ success: false, error: 'Google Calendar not configured' }, 503);
    }

    // Determine target user
    let lineUserId: string | undefined;
    if (body.lineUserId) {
      lineUserId = body.lineUserId;
    } else if (body.friendId) {
      const friend = await c.env.DB.prepare('SELECT user_id FROM friends WHERE id = ?').bind(body.friendId).first<{ user_id: string }>();
      if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);
      lineUserId = friend.user_id;
    } else {
      return c.json({ success: false, error: 'friendId or lineUserId is required' }, 400);
    }

    // Get date (default: today JST)
    const jstNow = new Date(Date.now() + 9 * 60 * 60_000);
    const date = body.date ?? `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;

    const accessToken = await getAccessToken({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_SERVICE_ACCOUNT_KEY: env.GOOGLE_SERVICE_ACCOUNT_KEY,
      GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
    });

    const slots = await getAvailableSlots(accessToken, env.GOOGLE_CALENDAR_ID, date, 14, 21, 60);
    const flex = buildAvailableSlotsFlex(date, slots);

    const lineClient = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
    await lineClient.pushMessage(lineUserId!, [buildMessage('flex', JSON.stringify(flex))]);

    return c.json({ success: true, data: { date, slotsCount: slots.length } });
  } catch (err) {
    console.error('POST /api/bookings/send-slots error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { bookings };
