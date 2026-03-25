import type { Env, Keyword } from './types';
import { generateOutline, generateSection } from './claude';
import { createDraftPost } from './wordpress';

interface Outline {
  title: string;
  meta_description: string;
  slug: string;
  sections: Array<{
    h2: string;
    h3s: string[];
    key_points: string[];
  }>;
}

export async function processKeyword(env: Env, keyword: Keyword): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Update status to generating
    await env.DB.prepare('UPDATE seo_keywords SET status = ?, updated_at = datetime() WHERE id = ?')
      .bind('generating', keyword.id)
      .run();

    // 2. Generate outline
    const outlineRaw = await generateOutline(env, keyword.keyword, keyword.search_intent);
    let outline: Outline;
    try {
      outline = JSON.parse(outlineRaw);
    } catch {
      // Try extracting JSON from response
      const match = outlineRaw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Failed to parse outline JSON');
      outline = JSON.parse(match[0]);
    }

    // 3. Generate content section by section
    const contentParts: string[] = [];
    for (const section of outline.sections) {
      const sectionOutline = JSON.stringify(section);
      const sectionHtml = await generateSection(env, keyword.keyword, outline.title, sectionOutline);
      contentParts.push(sectionHtml);
    }
    const fullContent = contentParts.join('\n\n');

    // 4. Count words (Japanese: count characters excluding HTML tags)
    const textOnly = fullContent.replace(/<[^>]*>/g, '');
    const wordCount = textOnly.length;

    // 5. Save article to DB
    const result = await env.DB.prepare(`
      INSERT INTO seo_articles (keyword_id, title, slug, meta_description, content, status, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, datetime(), datetime())
    `).bind(
      keyword.id,
      outline.title,
      outline.slug,
      outline.meta_description,
      fullContent,
      wordCount
    ).run();

    const articleId = result.meta.last_row_id;

    // 6. Post to WordPress as draft
    const wpResult = await createDraftPost(
      env,
      outline.title,
      fullContent,
      outline.slug,
      outline.meta_description
    );

    // 7. Update article with WP post ID
    await env.DB.prepare('UPDATE seo_articles SET wp_post_id = ?, status = ?, updated_at = datetime() WHERE id = ?')
      .bind(wpResult.id, 'posted', articleId)
      .run();

    // 8. Update keyword status
    await env.DB.prepare('UPDATE seo_keywords SET status = ?, updated_at = datetime() WHERE id = ?')
      .bind('posted', keyword.id)
      .run();

    return {
      success: true,
      message: `Article "${outline.title}" created (${wordCount} chars) → WP draft #${wpResult.id}`,
    };
  } catch (error) {
    // Mark as failed
    await env.DB.prepare('UPDATE seo_keywords SET status = ?, updated_at = datetime() WHERE id = ?')
      .bind('failed', keyword.id)
      .run();

    return {
      success: false,
      message: `Failed for "${keyword.keyword}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function runPipeline(env: Env, limit: number = 1): Promise<string[]> {
  // Get pending keywords
  const { results } = await env.DB.prepare(
    'SELECT * FROM seo_keywords WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT ?'
  ).bind('pending', limit).all<Keyword>();

  if (!results.length) {
    return ['No pending keywords found'];
  }

  const messages: string[] = [];
  for (const keyword of results) {
    const result = await processKeyword(env, keyword);
    messages.push(`${result.success ? '✅' : '❌'} ${result.message}`);
  }

  return messages;
}
