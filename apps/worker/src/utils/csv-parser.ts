/**
 * CSV→JSON parser for Lステップ friend export format.
 *
 * Supported CSV column orders (auto-detected from header row):
 *
 * Format A (ステータスID先頭):
 *   LINEユーザーID, 表示名, 登録日, タグ, 友だち情報01, ...
 *
 * Format B (表示名先頭 - Lステップ標準エクスポート):
 *   表示名, ステータスID, 登録日時, タグ, 友だち情報01, ...
 *
 * Tags within a single cell are separated by "|" (pipe) since commas are
 * the field delimiter. If the CSV uses a different in-cell separator,
 * adjust TAG_SEPARATOR below.
 */

const TAG_SEPARATOR = '|';

export interface ImportFriendRow {
  line_user_id: string;
  display_name: string;
  registration_date: string;
  tags: string[];
  metadata: Record<string, string>;
}

export interface ImportPayload {
  friends: ImportFriendRow[];
}

/** Detect column mapping from header row */
function detectColumnMapping(header: string[]): {
  userIdIdx: number;
  nameIdx: number;
  dateIdx: number;
  tagsIdx: number;
  extraStartIdx: number;
} {
  const normalized = header.map((h) => h.trim().replace(/\ufeff/, ''));

  // Check for Format B: 表示名,ステータスID,登録日時,タグ
  const statusIdIdx = normalized.findIndex(
    (h) => h === 'ステータスID' || h === 'StatusID' || h === 'status_id',
  );
  if (statusIdIdx >= 0) {
    const nameIdx = normalized.findIndex(
      (h) => h === '表示名' || h === 'DisplayName' || h === 'display_name',
    );
    const dateIdx = normalized.findIndex(
      (h) => h.includes('登録日') || h === 'registered_at' || h === 'RegisteredAt',
    );
    const tagsIdx = normalized.findIndex(
      (h) => h === 'タグ' || h === 'Tags' || h === 'tags',
    );

    return {
      userIdIdx: statusIdIdx,
      nameIdx: nameIdx >= 0 ? nameIdx : 0,
      dateIdx: dateIdx >= 0 ? dateIdx : 2,
      tagsIdx: tagsIdx >= 0 ? tagsIdx : 3,
      extraStartIdx: Math.max(statusIdIdx, nameIdx >= 0 ? nameIdx : 0, dateIdx >= 0 ? dateIdx : 2, tagsIdx >= 0 ? tagsIdx : 3) + 1,
    };
  }

  // Default Format A: LINEユーザーID, 表示名, 登録日, タグ, ...
  return {
    userIdIdx: 0,
    nameIdx: 1,
    dateIdx: 2,
    tagsIdx: 3,
    extraStartIdx: 4,
  };
}

/**
 * Parse a raw CSV string (Lステップ export format) into an ImportPayload.
 * Handles quoted fields that may contain commas.
 * Auto-detects column order from the header row.
 */
export function parseLstepCsv(csvText: string): ImportPayload {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Skip header row
  if (lines.length <= 1) {
    return { friends: [] };
  }

  const headerFields = parseCsvLine(lines[0]);
  const mapping = detectColumnMapping(headerFields);

  const friends: ImportFriendRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 2) continue;

    const lineUserId = fields[mapping.userIdIdx]?.trim();
    if (!lineUserId) continue;

    // Skip rows where user ID doesn't look like a LINE user ID (U + hex)
    if (!lineUserId.startsWith('U')) continue;

    const displayName = fields[mapping.nameIdx]?.trim() || '';
    const registrationDate = fields[mapping.dateIdx]?.trim() || '';

    // Tags field - pipe-separated within the cell
    const tagsRaw = fields[mapping.tagsIdx]?.trim() || '';
    const tags = tagsRaw
      ? tagsRaw.split(TAG_SEPARATOR).map((t) => t.trim()).filter(Boolean)
      : [];

    // Extra fields (友だち情報01, 02, ...) go into metadata
    const metadata: Record<string, string> = {};
    if (registrationDate) {
      metadata.registration_date = registrationDate;
    }
    for (let j = mapping.extraStartIdx; j < fields.length; j++) {
      const value = fields[j]?.trim();
      if (value) {
        metadata[`custom_field_${String(j - mapping.extraStartIdx + 1).padStart(2, '0')}`] = value;
      }
    }

    friends.push({
      line_user_id: lineUserId,
      display_name: displayName,
      registration_date: registrationDate,
      tags,
      metadata,
    });
  }

  return { friends };
}

/**
 * Parse a single CSV line, respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}
