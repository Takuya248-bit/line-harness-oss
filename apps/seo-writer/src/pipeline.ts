import type { Env, Keyword } from './types';
import { generateOutline, generateSection, polishArticle } from './claude';
import { createDraftPost, publishPost } from './wordpress';
import { fetchCaseStudies, buildCaseStudyPrompt, buildSplitCaseStudyPrompts } from './case-studies';

interface Outline {
  title: string;
  meta_description: string;
  slug: string;
  tldr?: string;
  related_keywords?: string[];
  sections: Array<{
    h2: string;
    h3s: string[];
    key_points: string[];
    experience_note?: string;
  }>;
}

const MIN_WORD_COUNT = 1000;
const MAX_PREVIOUS_SECTIONS_LENGTH = 2000;

function validateHtml(html: string): boolean {
  const openTags = html.match(/<(h2|h3|p|ul|ol|li|table|thead|tbody|tr|th|td|strong|a)\b[^>]*>/g) || [];
  const closeTags = html.match(/<\/(h2|h3|p|ul|ol|li|table|thead|tbody|tr|th|td|strong|a)>/g) || [];
  return Math.abs(openTags.length - closeTags.length) <= 2;
}

export async function processKeyword(env: Env, keyword: Keyword): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Update status to generating
    await env.DB.prepare('UPDATE seo_keywords SET status = ?, updated_at = datetime() WHERE id = ?')
      .bind('generating', keyword.id)
      .run();

    // 2. Generate outline (with retry)
    let outline: Outline;
    for (let attempt = 0; attempt < 2; attempt++) {
      const outlineRaw = await generateOutline(env, keyword.keyword, keyword.search_intent);
      try {
        outline = JSON.parse(outlineRaw);
        break;
      } catch {
        const match = outlineRaw.match(/\{[\s\S]*\}/);
        if (match) {
          outline = JSON.parse(match[0]);
          break;
        }
        if (attempt === 1) throw new Error('Failed to parse outline JSON after 2 attempts');
      }
    }
    outline = outline!;

    // 2.5. Fetch case studies for this keyword
    const caseStudies = await fetchCaseStudies(env, keyword.keyword);
    const totalSections = outline.sections.length;

    // Distributed case study injection:
    // - 2+ case studies: split into challenge/solution at 40% and results/metrics at 70%
    // - 1 case study: full injection at 60% (legacy behavior)
    let caseStudyInjections: Map<number, string>;
    if (caseStudies.length >= 2) {
      const [promptA, promptB] = buildSplitCaseStudyPrompts(caseStudies);
      const indexA = Math.max(0, Math.floor(totalSections * 0.4));
      const indexB = Math.min(totalSections - 1, Math.floor(totalSections * 0.7));
      caseStudyInjections = new Map([
        [indexA, promptA],
        [indexB, promptB],
      ]);
    } else {
      const caseStudyPrompt = buildCaseStudyPrompt(caseStudies);
      const injectionIndex = Math.max(0, Math.floor(totalSections * 0.6));
      caseStudyInjections = caseStudyPrompt ? new Map([[injectionIndex, caseStudyPrompt]]) : new Map();
    }

    // 3. Generate content section by section (with context passing)
    const contentParts: string[] = [];
    let previousSections = '';
    for (let i = 0; i < outline.sections.length; i++) {
      const section = outline.sections[i];
      const sectionOutline = JSON.stringify(section);
      const csPrompt = caseStudyInjections.get(i);
      const sectionHtml = await generateSection(
        env,
        keyword.keyword,
        outline.title,
        sectionOutline,
        previousSections,
        csPrompt
      );
      contentParts.push(sectionHtml);
      // Pass summary of previous sections to avoid repetition (with length limit)
      const sectionText = sectionHtml.replace(/<[^>]*>/g, '').substring(0, 400);
      previousSections += `\n[${section.h2}]: ${sectionText}`;
      if (previousSections.length > MAX_PREVIOUS_SECTIONS_LENGTH) {
        previousSections = previousSections.substring(previousSections.length - MAX_PREVIOUS_SECTIONS_LENGTH);
      }
    }
    const rawContent = contentParts.join('\n\n');

    // 4. Polish: AI review pass (with fallback to raw content on failure)
    let finalContent: string;
    try {
      finalContent = await polishArticle(
        env,
        keyword.keyword,
        outline.title,
        outline.tldr || '',
        rawContent
      );
    } catch (polishError) {
      console.warn('Polish failed, using raw content:', polishError);
      finalContent = rawContent;
    }

    // 5. Quality gate
    const textOnly = finalContent.replace(/<[^>]*>/g, '');
    const wordCount = textOnly.length;

    if (wordCount < MIN_WORD_COUNT) {
      throw new Error(`Article too short: ${wordCount} chars (minimum: ${MIN_WORD_COUNT})`);
    }

    if (!validateHtml(finalContent)) {
      console.warn(`HTML validation warning for "${outline.title}" - tag mismatch detected`);
    }

    // 6. Save article to DB
    const result = await env.DB.prepare(`
      INSERT INTO seo_articles (keyword_id, title, slug, meta_description, content, status, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, datetime(), datetime())
    `).bind(
      keyword.id,
      outline.title,
      outline.slug,
      outline.meta_description,
      finalContent,
      wordCount
    ).run();

    const articleId = result.meta.last_row_id;

    // 7. Post to WordPress and auto-publish
    let wpPostId: number | null = null;
    let wpLink = '';
    try {
      const wpResult = await createDraftPost(
        env,
        outline.title,
        finalContent,
        outline.slug,
        outline.meta_description
      );
      wpPostId = wpResult.id;

      await publishPost(env, wpResult.id);
      wpLink = wpResult.link;

      // 8. Update article as published
      await env.DB.prepare('UPDATE seo_articles SET wp_post_id = ?, status = ?, updated_at = datetime() WHERE id = ?')
        .bind(wpPostId, 'published', articleId)
        .run();

      await env.DB.prepare('UPDATE seo_keywords SET status = ?, updated_at = datetime() WHERE id = ?')
        .bind('published', keyword.id)
        .run();
    } catch (wpError) {
      // WP failed but article is saved in DB - mark as draft, not failed
      await env.DB.prepare('UPDATE seo_articles SET wp_post_id = ?, status = ?, updated_at = datetime() WHERE id = ?')
        .bind(wpPostId, 'draft', articleId)
        .run();

      await env.DB.prepare('UPDATE seo_keywords SET status = ?, updated_at = datetime() WHERE id = ?')
        .bind('generated', keyword.id)
        .run();

      return {
        success: false,
        message: `Article "${outline.title}" saved but WP publish failed: ${wpError instanceof Error ? wpError.message : String(wpError)}`,
      };
    }

    return {
      success: true,
      message: `Article "${outline.title}" published (${wordCount} chars) → WP #${wpPostId} (${wpLink})`,
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
