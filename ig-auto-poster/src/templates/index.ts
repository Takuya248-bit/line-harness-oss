import type { ContentItem, SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { buildCoverNode } from "./cover";
import { buildCtaNode } from "./cta";
import { buildListSlideNode } from "./list-slide";
import { buildQuizQuestionNode } from "./quiz-question";
import { buildQuizAnswerNode } from "./quiz-answer";
import { buildBeforeAfterNode } from "./before-after";
import { buildSituationNode } from "./situation";
import { buildStoryNode } from "./story";
import { buildStudentNode } from "./student";
import { buildBaliReportNode } from "./bali-report";
import { buildBaliCoverNode, type BaliCoverData } from "./bali-cover";
import { buildBaliSpotNode, type BaliSpotData } from "./bali-spot";
import { buildBaliSummaryNode, type BaliSummaryData } from "./bali-summary";
import { buildBaliCtaNode } from "./bali-cta";

function buildContentNode(
  content: ContentItem,
  slide: SlideData,
  slideIndex: number,
  totalContentSlides: number,
): SatoriNode {
  const pageLabel = `${slideIndex}/${totalContentSlides}`;

  switch (content.type) {
    case "list":
      return buildListSlideNode(slide, pageLabel);
    case "quiz":
      return slide.slideNumber % 2 === 0
        ? buildQuizQuestionNode(slide)
        : buildQuizAnswerNode(slide);
    case "before_after":
      return buildBeforeAfterNode(slide);
    case "situation":
      return buildSituationNode(slide);
    case "story":
      return buildStoryNode(slide);
    case "student_mistake":
      return buildStudentNode(slide);
    case "bali_report":
      return buildBaliReportNode(slide);
    default:
      return buildListSlideNode(slide, pageLabel);
  }
}

export function buildSlides(content: ContentItem): SatoriNode[] {
  const nodes: SatoriNode[] = [];
  const contentSlides = content.slides.filter((s) => s.slideType === "content");
  let contentIndex = 0;

  for (const slide of content.slides) {
    if (slide.slideType === "cover") {
      nodes.push(buildCoverNode(content.title, content.subtitle));
    } else if (slide.slideType === "cta") {
      nodes.push(buildCtaNode(slide.leadMagnet ?? ""));
    } else {
      contentIndex++;
      nodes.push(buildContentNode(content, slide, contentIndex, contentSlides.length));
    }
  }

  return nodes;
}

export interface BaliContentV2 {
  category: string;
  area: string;
  title: string;
  coverData: BaliCoverData;
  spotsData: BaliSpotData[];
  summaryData: BaliSummaryData;
  caption: string;
  attributions: string[];
}

export function buildV2Slides(content: BaliContentV2): SatoriNode[] {
  const nodes: SatoriNode[] = [];
  nodes.push(buildBaliCoverNode(content.coverData));
  for (const spot of content.spotsData) {
    nodes.push(buildBaliSpotNode(spot));
  }
  nodes.push(buildBaliSummaryNode(content.summaryData));
  nodes.push(buildBaliCtaNode());
  return nodes;
}
