// 型定義スタブ（v3テンプレートの型チェック用。実データは削除済み）
export type ContentType = 'list' | 'quiz' | 'before_after' | 'situation' | 'story' | 'student_mistake' | 'bali_report';

export interface SlideData {
  slideNumber: number;
  slideType: 'cover' | 'content' | 'cta';
  phraseEn?: string;
  phraseJp?: string;
  exampleEn?: string;
  exampleJp?: string;
  questionJp?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  correctOption?: string;
  answerEn?: string;
  answerJp?: string;
  explanation?: string;
  beforeEn?: string;
  beforeJp?: string;
  afterEn?: string;
  afterJp?: string;
  tip?: string;
  scene?: string;
  sceneTitle?: string;
  phraseEn1?: string;
  phraseJp1?: string;
  responseEn?: string;
  responseJp?: string;
  point?: string;
  storyTitle?: string;
  storyBody?: string;
  mistakeEn?: string;
  correctEn?: string;
  mistakeExplanation?: string;
  mistakeNumber?: string;
  locationName?: string;
  usageTip?: string;
  leadMagnet?: string;
}

export interface ContentItem {
  id: number;
  type: ContentType;
  title: string;
  subtitle: string;
  slides: SlideData[];
}
