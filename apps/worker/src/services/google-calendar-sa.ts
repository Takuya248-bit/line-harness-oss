/**
 * Google Calendar API client using Service Account (JWT + crypto.subtle).
 * Compatible with Cloudflare Workers (no Node.js crypto).
 */

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const TIMEZONE = 'Asia/Tokyo';

export interface ServiceAccountEnv {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_CALENDAR_ID: string;
}

function base64url(input: string | ArrayBuffer): string {
  const str =
    typeof input === 'string'
      ? btoa(input)
      : btoa(String.fromCharCode(...new Uint8Array(input)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create a signed JWT for Google Service Account auth using Web Crypto API.
 */
async function createJWT(email: string, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claim));
  const signInput = `${encodedHeader}.${encodedClaim}`;

  // PEM -> CryptoKey
  const pemContents = privateKeyPem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput),
  );
  const encodedSignature = base64url(signature);

  return `${signInput}.${encodedSignature}`;
}

/**
 * Get an access token using the service account JWT.
 */
export async function getAccessToken(env: ServiceAccountEnv): Promise<string> {
  const jwt = await createJWT(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_SERVICE_ACCOUNT_KEY);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Google token exchange: no access_token in response');
  }

  return data.access_token;
}

export interface TimeSlot {
  start: string; // HH:mm
  end: string; // HH:mm
  startISO: string; // full ISO
  endISO: string; // full ISO
}

/**
 * Get available time slots for a given date by checking existing events.
 */
export async function getAvailableSlots(
  accessToken: string,
  calendarId: string,
  date: string, // YYYY-MM-DD
  startHour: number,
  endHour: number,
  slotMinutes: number,
): Promise<TimeSlot[]> {
  // Query existing events for the day
  const timeMin = `${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
  const timeMax = `${date}T${String(endHour).padStart(2, '0')}:00:00+09:00`;

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    timeZone: TIMEZONE,
  });

  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Calendar events.list error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    }>;
  };

  // Collect busy intervals
  const busy: Array<{ start: number; end: number }> = [];
  for (const item of data.items ?? []) {
    if (item.start?.dateTime && item.end?.dateTime) {
      busy.push({
        start: new Date(item.start.dateTime).getTime(),
        end: new Date(item.end.dateTime).getTime(),
      });
    }
  }

  // Generate all possible slots
  const slots: TimeSlot[] = [];
  const baseTime = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`).getTime();

  for (let h = startHour; h + slotMinutes / 60 <= endHour; h += slotMinutes / 60) {
    const slotStart = baseTime + (h - startHour) * 60 * 60_000;
    const slotEnd = slotStart + slotMinutes * 60_000;

    // Check overlap with busy intervals
    const isBusy = busy.some((b) => slotStart < b.end && slotEnd > b.start);
    if (isBusy) continue;

    // Also skip past slots
    if (slotStart < Date.now()) continue;

    const startDate = new Date(slotStart);
    const endDate = new Date(slotEnd);

    // Format HH:mm in JST
    const startJST = new Date(slotStart + 9 * 60 * 60_000);
    const endJST = new Date(slotEnd + 9 * 60 * 60_000);
    const startHHMM = `${String(startJST.getUTCHours()).padStart(2, '0')}:${String(startJST.getUTCMinutes()).padStart(2, '0')}`;
    const endHHMM = `${String(endJST.getUTCHours()).padStart(2, '0')}:${String(endJST.getUTCMinutes()).padStart(2, '0')}`;

    slots.push({
      start: startHHMM,
      end: endHHMM,
      startISO: startDate.toISOString(),
      endISO: endDate.toISOString(),
    });
  }

  return slots;
}

/**
 * Create an event on Google Calendar.
 */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: { summary: string; start: string; end: string; description?: string },
): Promise<{ id: string }> {
  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  const body = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start, timeZone: TIMEZONE },
    end: { dateTime: event.end, timeZone: TIMEZONE },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Calendar createEvent error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Google Calendar createEvent: missing event id');
  return { id: data.id };
}

/**
 * Delete an event from Google Calendar.
 */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 410) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Calendar deleteEvent error ${res.status}: ${text}`);
  }
}
