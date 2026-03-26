export interface SegmentRule {
  type: 'tag_exists' | 'tag_not_exists' | 'metadata_equals' | 'metadata_not_equals' | 'ref_code' | 'is_following'
  value: string | boolean | { key: string; value: string }
}

export interface SegmentCondition {
  operator: 'AND' | 'OR'
  rules: SegmentRule[]
  lineAccountId?: string
}

/**
 * Build a SegmentCondition from simpler tag-based parameters.
 * Converts { tags, tagMode, excludeTags } into the full SegmentCondition format.
 *
 * Example input:
 *   { tags: ["id1", "id2"], tagMode: "and", excludeTags: ["id3"], lineAccountId: "acc1" }
 *
 * The resulting condition will:
 * - AND mode: friends must have ALL specified tags
 * - OR mode: friends must have ANY of the specified tags
 * - Excluded tags are always AND'd (friends must NOT have any of them)
 * - Only following friends are included
 * - Filtered by lineAccountId
 */
export function buildTagCondition(opts: {
  tags: string[]
  tagMode: 'and' | 'or'
  excludeTags?: string[]
  lineAccountId?: string
}): SegmentCondition {
  const rules: SegmentRule[] = []

  for (const tagId of opts.tags) {
    rules.push({ type: 'tag_exists', value: tagId })
  }

  if (opts.excludeTags) {
    for (const tagId of opts.excludeTags) {
      rules.push({ type: 'tag_not_exists', value: tagId })
    }
  }

  // Always filter to following friends only
  rules.push({ type: 'is_following', value: true })

  return {
    operator: opts.tagMode === 'and' ? 'AND' : 'OR',
    rules,
    lineAccountId: opts.lineAccountId,
  }
}

export function buildSegmentQuery(condition: SegmentCondition): { sql: string; bindings: unknown[] } {
  // Separate include rules (joined by the condition operator) from
  // mandatory rules (always AND'd: tag_not_exists, metadata_not_equals, is_following).
  // This ensures OR mode only applies to positive match conditions,
  // while exclusions and filters are always enforced.
  const includeClauses: string[] = []
  const includeBindings: unknown[] = []
  const mandatoryClauses: string[] = []
  const mandatoryBindings: unknown[] = []

  for (const rule of condition.rules) {
    switch (rule.type) {
      case 'tag_exists': {
        if (typeof rule.value !== 'string') {
          throw new Error('tag_exists rule requires a string tag ID value')
        }
        includeClauses.push(
          `EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = f.id AND ft.tag_id = ?)`,
        )
        includeBindings.push(rule.value)
        break
      }

      case 'tag_not_exists': {
        if (typeof rule.value !== 'string') {
          throw new Error('tag_not_exists rule requires a string tag ID value')
        }
        // Exclusions are always mandatory (AND'd)
        mandatoryClauses.push(
          `NOT EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = f.id AND ft.tag_id = ?)`,
        )
        mandatoryBindings.push(rule.value)
        break
      }

      case 'metadata_equals': {
        if (
          typeof rule.value !== 'object' ||
          rule.value === null ||
          typeof (rule.value as { key: string; value: string }).key !== 'string' ||
          typeof (rule.value as { key: string; value: string }).value !== 'string'
        ) {
          throw new Error('metadata_equals rule requires { key: string; value: string }')
        }
        const mv = rule.value as { key: string; value: string }
        includeClauses.push(`json_extract(f.metadata, ?) = ?`)
        includeBindings.push(`$.${mv.key}`, mv.value)
        break
      }

      case 'metadata_not_equals': {
        if (
          typeof rule.value !== 'object' ||
          rule.value === null ||
          typeof (rule.value as { key: string; value: string }).key !== 'string' ||
          typeof (rule.value as { key: string; value: string }).value !== 'string'
        ) {
          throw new Error('metadata_not_equals rule requires { key: string; value: string }')
        }
        const mv = rule.value as { key: string; value: string }
        mandatoryClauses.push(`(json_extract(f.metadata, ?) IS NULL OR json_extract(f.metadata, ?) != ?)`)
        mandatoryBindings.push(`$.${mv.key}`, `$.${mv.key}`, mv.value)
        break
      }

      case 'ref_code': {
        if (typeof rule.value !== 'string') {
          throw new Error('ref_code rule requires a string value')
        }
        includeClauses.push(`f.ref_code = ?`)
        includeBindings.push(rule.value)
        break
      }

      case 'is_following': {
        if (typeof rule.value !== 'boolean') {
          throw new Error('is_following rule requires a boolean value')
        }
        // is_following is always mandatory
        mandatoryClauses.push(`f.is_following = ?`)
        mandatoryBindings.push(rule.value ? 1 : 0)
        break
      }

      default: {
        const exhaustive: never = rule.type
        throw new Error(`Unknown segment rule type: ${exhaustive}`)
      }
    }
  }

  // Add line_account_id filter if specified (always mandatory)
  if (condition.lineAccountId) {
    mandatoryClauses.push(`f.line_account_id = ?`)
    mandatoryBindings.push(condition.lineAccountId)
  }

  // Build the WHERE clause:
  // Include clauses are joined by the operator (AND/OR)
  // Mandatory clauses are always AND'd
  const parts: string[] = []
  const bindings: unknown[] = []

  if (includeClauses.length > 0) {
    const separator = condition.operator === 'AND' ? ' AND ' : ' OR '
    parts.push(`(${includeClauses.join(separator)})`)
    bindings.push(...includeBindings)
  }

  if (mandatoryClauses.length > 0) {
    parts.push(...mandatoryClauses)
    bindings.push(...mandatoryBindings)
  }

  const where = parts.length > 0 ? parts.join(' AND ') : '1=1'
  const sql = `SELECT f.id, f.line_user_id FROM friends f WHERE ${where}`

  return { sql, bindings }
}
