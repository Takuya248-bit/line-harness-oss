import type { Env, Keyword } from './types';
import { generateOutline, generateSection, polishArticle } from './claude';
import { createDraftPost, publishPost } from './wordpress';
import { fetchCaseStudies, buildCaseStudyPrompt } from './case-studies';

interface Outline {
  title: string;
  meta_description: string;
  slug: string;
  sections: Array<{
    h2: string;
    h3s: string[];
    key_points: string[];
    experience_note?: string;
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
      const match = outlineRaw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Failed to parse outline JSON');
      outline = JSON.parse(match[0]);
    }

    // 2.5. Fetch case studies for this keyword
    const caseStudies = await fetchCaseStudies(env, keyword.keyword);
    const caseStudyPrompt = buildCaseStudyPrompt(caseStudies);

    // Determine which section index to inject case studies (mid-to-late: ~60-70% through)
    const totalSections = outline.sections.length;
    const injectionIndex = Math.max(0, Math.floor(totalSections * 0.6));

    // 3. Generate content section by section (with context passing)
    const contentParts: string[] = [];
    let previousSections = '';
    for (let i = 0; i < outline.sections.length; i++) {
      const section = outline.sections[i];
      const sectionOutline = JSON.stringify(section);
      // Inject case study prompt at the target section
      const csPrompt = i === injectionIndex ? caseStudyPrompt : undefined;
      const sectionHtml = await generateSection(
        env,
        keyword.keyword,
        outline.title,
        sectionOutline,
        previousSections,
        csPrompt
      );
      contentParts.push(sectionHtml);
      // Pass summary of previous sections to avoid repetition
      const textOnly = sectionHtml.replace(/<[^>]*>/g, '').substring(0, 300);
      previousSections += `\n[${section.h2}]: ${textOnly}...`;
    }
    const rawContent = contentParts.join('\n\n');

    // 4. Polish: AI review pass (intro, CTA, anti-AI cleanup)
    const polishedContent = await polishArticle(env, keyword.keyword, outline.title, rawContent);

    // 5. Count characters (excluding HTML tags)
    const textOnly = polishedContent.replace(/<[^>]*>/g, '');
    const wordCount = textOnly.length;

    // 6. Save article to DB
    const result = await env.DB.prepare(`
      INSERT INTO seo_articles (keyword_id, title, slug, meta_description, content, status, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, datetime(), datetime())
    `).bind(
      keyword.id,
      outline.title,
      outline.slug,
      outline.meta_description,
      polishedContent,
      wordCount
    ).run();

    const articleId = result.meta.last_row_id;

    // 7. Post to WordPress and auto-publish
    const wpResult = await createDraftPost(
      env,
      outline.title,
      polishedContent,
      outline.slug,
      outline.meta_description
    );

    await publishPost(env, wpResult.id);

    // 8. Update article with WP post ID
    await env.DB.prepare('UPDATE seo_articles SET wp_post_id = ?, status = ?, updated_at = datetime() WHERE id = ?')
      .bind(wpResult.id, 'published', articleId)
      .run();

    // 9. Update keyword status
    await env.DB.prepare('UPDATE seo_keywords SET status = ?, updated_at = datetime() WHERE id = ?')
      .bind('published', keyword.id)
      .run();

    return {
      success: true,
      message: `Article "${outline.title}" published (${wordCount} chars) → WP #${wpResult.id} (${wpResult.link})`,
    };
  } catch (error) {
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
