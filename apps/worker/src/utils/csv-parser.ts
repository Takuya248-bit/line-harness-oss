/**
 * CSV→JSON parser for Lステップ friend export format.
 *
 * Expected CSV columns:
 *   LINEユーザーID, 表示名, 登録日, タグ（カンマ区切り）, 友だち情報01, 友だち情報02, ...
 *
 * Tags within a single cell are separated by "|" (pipe) since commas are
 * the field delimiter. If the CSV uses a different in-cell separator,
 * adjust TAG_SEPARATOR below.
 */

const TAG_SEPARATOR = '|';

export interface ImportFriendRow {
  line_user_id: string;
  display_name: string;
  tags: string[];
  metadata: Record<string, string>;
}

export interface ImportPayload {
  friends: ImportFriendRow[];
}

/**
 * Parse a raw CSV string (Lステップ export format) into an ImportPayload.
 * Handles quoted fields that may contain commas.
 */
export function parseLstepCsv(csvText: string): ImportPayload {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Skip header row
  if (lines.length <= 1) {
    return { friends: [] };
  }

  const friends: ImportFriendRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 2) continue;

    const lineUserId = fields[0]?.trim();
    if (!lineUserId) continue;

    const displayName = fields[1]?.trim() || '';
    const registrationDate = fields[2]?.trim() || '';

    // Tags field (index 3) - pipe-separated within the cell
    const tagsRaw = fields[3]?.trim() || '';
    const tags = tagsRaw
      ? tagsRaw.split(TAG_SEPARATOR).map((t) => t.trim()).filter(Boolean)
      : [];

    // Extra fields (友だち情報01, 02, ...) go into metadata
    const metadata: Record<string, string> = {};
    if (registrationDate) {
      metadata.registration_date = registrationDate;
    }
    for (let j = 4; j < fields.length; j++) {
      const value = fields[j]?.trim();
      if (value) {
        metadata[`custom_field_${String(j - 3).padStart(2, '0')}`] = value;
      }
    }

    friends.push({ line_user_id: lineUserId, display_name: displayName, tags, metadata });
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
