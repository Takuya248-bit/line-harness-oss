// バリリンガル Instagram カルーセル投稿 ネタデータ
// 30本: リスト型8 / クイズ型8 / Before/After型7 / シチュエーション型7

export type ContentType = 'list' | 'quiz' | 'before_after' | 'situation' | 'story' | 'student_mistake' | 'bali_report';

export interface SlideData {
  slideNumber: number;
  slideType: 'cover' | 'content' | 'cta';
  // リスト型
  phraseEn?: string;
  phraseJp?: string;
  exampleEn?: string;
  exampleJp?: string;
  // クイズ型
  questionJp?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  correctOption?: string;
  answerEn?: string;
  answerJp?: string;
  explanation?: string;
  // Before/After型
  beforeEn?: string;
  beforeJp?: string;
  afterEn?: string;
  afterJp?: string;
  tip?: string;
  // シチュエーション型
  scene?: string;
  sceneTitle?: string;
  phraseEn1?: string;
  phraseJp1?: string;
  responseEn?: string;
  responseJp?: string;
  point?: string;
  // ストーリー型
  storyTitle?: string;
  storyBody?: string;
  // 生徒あるある型
  mistakeEn?: string;
  correctEn?: string;
  mistakeExplanation?: string;
  mistakeNumber?: string;
  // バリ現地レポ型
  locationName?: string;
  usageTip?: string;
  // CTA
  leadMagnet?: string;
}

export interface ContentItem {
  id: number;
  type: ContentType;
  title: string;
  subtitle: string;
  slides: SlideData[];
}

// ============================================================
// リスト型 8本
// ============================================================

const listItems: ContentItem[] = [
  {
    id: 1,
    type: 'list',
    title: 'ネイティブが毎日使う\n英語フレーズ5選',
    subtitle: '知らないと損する表現集',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', phraseEn: 'That makes sense', phraseJp: 'なるほどね', exampleEn: 'A: I took a shortcut. B: That makes sense!', exampleJp: 'A: 近道したんだ B: なるほどね！' },
      { slideNumber: 3, slideType: 'content', phraseEn: 'No worries', phraseJp: '大丈夫だよ / 気にしないで', exampleEn: "A: Sorry I'm late! B: No worries!", exampleJp: 'A: 遅れてごめん！ B: 気にしないで！' },
      { slideNumber: 4, slideType: 'content', phraseEn: "I'm good", phraseJp: '大丈夫です / 結構です', exampleEn: "A: Want some more? B: I'm good, thanks.", exampleJp: 'A: もっといる？ B: 大丈夫、ありがとう。' },
      { slideNumber: 5, slideType: 'content', phraseEn: 'Sounds good', phraseJp: 'いいね / 了解', exampleEn: "A: Let's meet at 7. B: Sounds good!", exampleJp: 'A: 7時に会おう B: いいね！' },
      { slideNumber: 6, slideType: 'content', phraseEn: 'Let me check', phraseJp: 'ちょっと確認するね', exampleEn: 'A: Is the shop open today? B: Let me check.', exampleJp: 'A: 今日お店やってる？ B: ちょっと確認するね。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 2,
    type: 'list',
    title: '旅行先で絶対使う\n英語フレーズ5選',
    subtitle: 'これだけ覚えれば海外旅行OK',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', phraseEn: 'Could I have the bill, please?', phraseJp: 'お会計お願いします', exampleEn: 'Excuse me, could I have the bill, please?', exampleJp: 'すみません、お会計お願いします。' },
      { slideNumber: 3, slideType: 'content', phraseEn: 'Where is the nearest ATM?', phraseJp: '一番近いATMはどこですか？', exampleEn: 'Sorry, where is the nearest ATM around here?', exampleJp: 'すみません、この辺で一番近いATMはどこですか？' },
      { slideNumber: 4, slideType: 'content', phraseEn: 'Can I try this on?', phraseJp: '試着してもいいですか？', exampleEn: 'This looks nice. Can I try this on?', exampleJp: 'これいいですね。試着してもいいですか？' },
      { slideNumber: 5, slideType: 'content', phraseEn: 'Is this seat taken?', phraseJp: 'この席空いてますか？', exampleEn: 'Excuse me, is this seat taken?', exampleJp: 'すみません、この席空いてますか？' },
      { slideNumber: 6, slideType: 'content', phraseEn: 'Keep the change', phraseJp: 'おつりはいりません', exampleEn: 'Here you go. Keep the change.', exampleJp: 'はい、どうぞ。おつりはいりません。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 3,
    type: 'list',
    title: '教科書に載ってない\nあいづち英語5選',
    subtitle: '会話が自然に続く魔法の一言',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', phraseEn: 'Right?', phraseJp: 'だよね？', exampleEn: 'A: This weather is crazy. B: Right?', exampleJp: 'A: この天気やばいね B: だよね？' },
      { slideNumber: 3, slideType: 'content', phraseEn: 'For real?', phraseJp: 'マジで？', exampleEn: 'A: I quit my job. B: For real?', exampleJp: 'A: 仕事辞めたんだ B: マジで？' },
      { slideNumber: 4, slideType: 'content', phraseEn: 'Tell me about it', phraseJp: 'ほんとそれ', exampleEn: 'A: Mondays are the worst. B: Tell me about it.', exampleJp: 'A: 月曜って最悪だよね B: ほんとそれ。' },
      { slideNumber: 5, slideType: 'content', phraseEn: 'I know, right?', phraseJp: 'わかる〜！', exampleEn: 'A: This ramen is amazing! B: I know, right?', exampleJp: 'A: このラーメン最高！ B: わかる〜！' },
      { slideNumber: 6, slideType: 'content', phraseEn: 'Good for you!', phraseJp: 'よかったね！', exampleEn: 'A: I passed the exam! B: Good for you!', exampleJp: 'A: 試験受かった！ B: よかったね！' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 4,
    type: 'list',
    title: 'ビジネスメールで使える\n丁寧フレーズ5選',
    subtitle: 'コピペでそのまま使えます',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', phraseEn: 'I hope this email finds you well.', phraseJp: 'お世話になっております', exampleEn: 'Hi John, I hope this email finds you well.', exampleJp: 'ジョンさん、お世話になっております。' },
      { slideNumber: 3, slideType: 'content', phraseEn: 'I was wondering if...', phraseJp: '〜していただけますか？', exampleEn: 'I was wondering if you could send me the report.', exampleJp: 'レポートを送っていただけますか？' },
      { slideNumber: 4, slideType: 'content', phraseEn: 'Just a quick follow-up', phraseJp: '確認のご連絡です', exampleEn: 'Just a quick follow-up on our meeting yesterday.', exampleJp: '昨日の会議の確認のご連絡です。' },
      { slideNumber: 5, slideType: 'content', phraseEn: 'Please let me know if you need anything.', phraseJp: '何かあればお知らせください', exampleEn: "I've attached the file. Please let me know if you need anything.", exampleJp: 'ファイルを添付しました。何かあればお知らせください。' },
      { slideNumber: 6, slideType: 'content', phraseEn: 'Looking forward to hearing from you.', phraseJp: 'お返事お待ちしております', exampleEn: 'Thank you for your time. Looking forward to hearing from you.', exampleJp: 'お時間ありがとうございます。お返事お待ちしております。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 5,
    type: 'list',
    title: '褒め上手になれる\n英語フレーズ5選',
    subtitle: '人間関係が一瞬で良くなる',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', phraseEn: 'You nailed it!', phraseJp: '完璧だったよ！', exampleEn: 'Great presentation! You nailed it!', exampleJp: 'いいプレゼンだった！完璧だったよ！' },
      { slideNumber: 3, slideType: 'content', phraseEn: "That's impressive!", phraseJp: 'すごいね！', exampleEn: "You speak three languages? That's impressive!", exampleJp: '3ヶ国語話せるの？すごいね！' },
      { slideNumber: 4, slideType: 'content', phraseEn: 'I love your style', phraseJp: 'センスいいね', exampleEn: 'I love your style. Where did you get that?', exampleJp: 'センスいいね。それどこで買ったの？' },
      { slideNumber: 5, slideType: 'content', phraseEn: "You're a natural", phraseJp: '天才肌だね', exampleEn: "You're a natural at surfing!", exampleJp: 'サーフィンの天才肌だね！' },
      { slideNumber: 6, slideType: 'content', phraseEn: 'That means a lot', phraseJp: 'すごく嬉しい', exampleEn: "A: Your English is getting so good! B: That means a lot.", exampleJp: 'A: 英語めっちゃ上達したね！ B: すごく嬉しい。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 6,
    type: 'list',
    title: '断るときに使える\nやわらかい英語5選',
    subtitle: 'Noと言わずに断る技術',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', phraseEn: "I'll pass this time", phraseJp: '今回はやめとくね', exampleEn: "A: Wanna go drinking? B: I'll pass this time.", exampleJp: 'A: 飲みに行かない？ B: 今回はやめとくね。' },
      { slideNumber: 3, slideType: 'content', phraseEn: 'I wish I could, but...', phraseJp: '行きたいんだけど...', exampleEn: 'I wish I could, but I have plans already.', exampleJp: '行きたいんだけど、もう予定があって。' },
      { slideNumber: 4, slideType: 'content', phraseEn: 'Maybe next time', phraseJp: 'また今度ね', exampleEn: "I'm swamped today. Maybe next time?", exampleJp: '今日忙しくて。また今度ね？' },
      { slideNumber: 5, slideType: 'content', phraseEn: "I'm not really into that", phraseJp: 'ちょっと苦手なんだよね', exampleEn: "I'm not really into horror movies.", exampleJp: 'ホラー映画ちょっと苦手なんだよね。' },
      { slideNumber: 6, slideType: 'content', phraseEn: 'Let me think about it', phraseJp: 'ちょっと考えさせて', exampleEn: 'Interesting offer. Let me think about it.', exampleJp: '面白い話だね。ちょっと考えさせて。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 7,
    type: 'list',
    title: '感情を伝える\n英語フレーズ5選',
    subtitle: '喜怒哀楽を英語で表現しよう',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', phraseEn: "I'm over the moon!", phraseJp: '最高に嬉しい！', exampleEn: "I got the job! I'm over the moon!", exampleJp: '採用された！最高に嬉しい！' },
      { slideNumber: 3, slideType: 'content', phraseEn: "I'm fed up with...", phraseJp: '〜にうんざりしてる', exampleEn: "I'm fed up with this rain.", exampleJp: 'この雨にうんざりしてる。' },
      { slideNumber: 4, slideType: 'content', phraseEn: "I'm gutted", phraseJp: 'めちゃくちゃ悔しい', exampleEn: "We lost the final. I'm gutted.", exampleJp: '決勝で負けた。めちゃくちゃ悔しい。' },
      { slideNumber: 5, slideType: 'content', phraseEn: "I can't be bothered", phraseJp: 'めんどくさい', exampleEn: "I can't be bothered to cook tonight.", exampleJp: '今夜料理するのめんどくさい。' },
      { slideNumber: 6, slideType: 'content', phraseEn: 'It blew my mind', phraseJp: '衝撃を受けた', exampleEn: 'The sunset in Bali blew my mind.', exampleJp: 'バリの夕日に衝撃を受けた。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 8,
    type: 'list',
    title: 'ネイティブが使う\n短縮フレーズ5選',
    subtitle: '教科書英語から卒業しよう',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', phraseEn: 'Gonna (= going to)', phraseJp: '〜するつもり', exampleEn: "I'm gonna grab some coffee.", exampleJp: 'コーヒー買ってくるね。' },
      { slideNumber: 3, slideType: 'content', phraseEn: 'Wanna (= want to)', phraseJp: '〜したい', exampleEn: 'Wanna hang out this weekend?', exampleJp: '週末遊ばない？' },
      { slideNumber: 4, slideType: 'content', phraseEn: 'Gotta (= got to)', phraseJp: '〜しなきゃ', exampleEn: 'I gotta go. See you later!', exampleJp: 'もう行かなきゃ。またね！' },
      { slideNumber: 5, slideType: 'content', phraseEn: 'Lemme (= let me)', phraseJp: 'ちょっと〜させて', exampleEn: 'Lemme see... How about Friday?', exampleJp: 'えーっと...金曜日はどう？' },
      { slideNumber: 6, slideType: 'content', phraseEn: 'Kinda (= kind of)', phraseJp: 'なんか / ちょっと', exampleEn: "I'm kinda tired today.", exampleJp: '今日なんか疲れたな。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
];

// ============================================================
// クイズ型 8本
// ============================================================

const quizItems: ContentItem[] = [
  {
    id: 9,
    type: 'quiz',
    title: '「なるほどね」\nって英語で言える？',
    subtitle: '意外と出てこない日常フレーズ',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', questionJp: '「なるほどね」って英語で言える？', optionA: 'I see', optionB: 'That makes sense', optionC: 'I understand', correctOption: 'B', answerEn: 'That makes sense', answerJp: 'なるほどね', explanation: '"I see"は軽い相づち。"That makes sense"は「理屈が通った」と理解を示す時に最適。"I understand"はフォーマルすぎて日常会話では不自然。' },
      { slideNumber: 3, slideType: 'content', questionJp: '「やっぱりね」って英語で言える？', optionA: 'I knew it', optionB: 'Of course', optionC: 'As I thought', correctOption: 'A', answerEn: 'I knew it!', answerJp: 'やっぱりね！', explanation: '"I knew it!"は予想通りだった時にネイティブが一番使うフレーズ。"As I thought"は直訳すぎて不自然。' },
      { slideNumber: 4, slideType: 'content', questionJp: '「微妙...」って英語で言える？', optionA: "It's delicate", optionB: "It's subtle", optionC: "It's iffy", correctOption: 'C', answerEn: "It's iffy", answerJp: '微妙だね', explanation: '"iffy"は「ちょっと怪しい、微妙」のカジュアル表現。"delicate"や"subtle"は「繊細な」の意味で全く違う。' },
      { slideNumber: 5, slideType: 'content', questionJp: '「めんどくさい」って英語で言える？', optionA: "It's annoying", optionB: "It's a hassle", optionC: "It's difficult", correctOption: 'B', answerEn: "It's a hassle", answerJp: 'めんどくさいなぁ', explanation: '"hassle"は「面倒なこと」を表すカジュアルな単語。"annoying"は「イライラする」、"difficult"は「難しい」でニュアンスが違う。' },
      { slideNumber: 6, slideType: 'content', questionJp: '「ドタキャン」って英語で言える？', optionA: 'sudden cancel', optionB: 'last-minute cancel', optionC: 'emergency cancel', correctOption: 'B', answerEn: 'last-minute cancel', answerJp: 'ドタキャン', explanation: '"last-minute"は「直前の」という意味。"He did a last-minute cancel"のように使う。"sudden cancel"は和製英語的で不自然。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 10,
    type: 'quiz',
    title: '「空気を読む」\nって英語で言える？',
    subtitle: '日本語特有の表現を英語に',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', questionJp: '「空気を読む」って英語で言える？', optionA: 'Read the air', optionB: 'Read the room', optionC: 'Feel the mood', correctOption: 'B', answerEn: 'Read the room', answerJp: '空気を読む', explanation: '"Read the room"がそのまま「空気を読む」の意味。"Read the air"は日本語の直訳で通じない。' },
      { slideNumber: 3, slideType: 'content', questionJp: '「もったいない」って英語で言える？', optionA: "It's a waste", optionB: "It's too bad", optionC: 'What a waste', correctOption: 'C', answerEn: 'What a waste!', answerJp: 'もったいない！', explanation: '"What a waste!"は感情を込めた表現。"It\'s a waste"でもOKだが、感嘆文の方が日本語の「もったいない！」のニュアンスに近い。' },
      { slideNumber: 4, slideType: 'content', questionJp: '「懐かしい」って英語で言える？', optionA: 'I miss it', optionB: "It's nostalgic", optionC: 'That takes me back', correctOption: 'C', answerEn: 'That takes me back!', answerJp: '懐かしい！', explanation: '"That takes me back"は「あの頃を思い出す」のニュアンス。"nostalgic"は文語的で会話ではあまり使わない。' },
      { slideNumber: 5, slideType: 'content', questionJp: '「適当にやっておいて」って英語で言える？', optionA: 'Do it properly', optionB: 'Just wing it', optionC: 'Do it randomly', correctOption: 'B', answerEn: 'Just wing it', answerJp: '適当にやって', explanation: '"wing it"は「ぶっつけ本番でやる、臨機応変にやる」の意味。日本語の「適当に」の良い意味に近い。' },
      { slideNumber: 6, slideType: 'content', questionJp: '「しょうがない」って英語で言える？', optionA: 'No choice', optionB: "It can't be helped", optionC: 'It is what it is', correctOption: 'C', answerEn: 'It is what it is', answerJp: 'しょうがないよ', explanation: '"It is what it is"はネイティブが日常的に使う「受け入れるしかない」のフレーズ。"It can\'t be helped"は直訳で固い。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 11,
    type: 'quiz',
    title: '「お疲れ様」\nって英語で言える？',
    subtitle: '実は直訳できない日本語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', questionJp: '退勤時の「お疲れ様」って英語で？', optionA: 'Good work today', optionB: 'You must be tired', optionC: 'See you tomorrow', correctOption: 'C', answerEn: 'See you tomorrow!', answerJp: 'また明日！', explanation: '英語には「お疲れ様」の直訳がない。退勤時は"See you tomorrow"や"Have a good evening"が自然。' },
      { slideNumber: 3, slideType: 'content', questionJp: '「いただきます」って英語で？', optionA: 'I will eat', optionB: "Let's eat!", optionC: 'Thank you for the food', correctOption: 'B', answerEn: "Let's eat! / Looks great!", answerJp: 'いただきます！', explanation: '英語には食前の決まり文句がない。"Let\'s eat!"や"This looks amazing!"と言うのが自然。' },
      { slideNumber: 4, slideType: 'content', questionJp: '「よろしくお願いします」って英語で？', optionA: 'Please take care of me', optionB: 'Nice to meet you', optionC: 'I look forward to working with you', correctOption: 'C', answerEn: 'I look forward to working with you', answerJp: 'よろしくお願いします', explanation: '場面次第で変わる。初対面なら"Nice to meet you"、仕事なら"I look forward to working with you"が適切。' },
      { slideNumber: 5, slideType: 'content', questionJp: '「とりあえずビール」って英語で？', optionA: 'Beer first', optionB: "I'll start with a beer", optionC: 'Anyway, beer', correctOption: 'B', answerEn: "I'll start with a beer", answerJp: 'とりあえずビールで', explanation: '"I\'ll start with~"は「まず〜から」の定番表現。レストランでの注文にそのまま使える。' },
      { slideNumber: 6, slideType: 'content', questionJp: '「お先に失礼します」って英語で？', optionA: "I'm leaving first", optionB: "I'm heading out", optionC: 'Excuse me for leaving', correctOption: 'B', answerEn: "I'm heading out. See you!", answerJp: 'お先に失礼します', explanation: '"I\'m heading out"はカジュアルに「帰るね」の意味。"I\'m leaving first"は直訳で不自然。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 12,
    type: 'quiz',
    title: '発音が似てるけど\n意味が全然違う英単語',
    subtitle: '間違えたら恥ずかしいやつ',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', questionJp: '"desert"と"dessert"、デザートはどっち？', optionA: 'desert', optionB: 'dessert', optionC: 'どっちも同じ', correctOption: 'B', answerEn: 'dessert', answerJp: 'デザート', explanation: '"dessert"(sが2つ)がデザート。"desert"(sが1つ)は砂漠。覚え方: デザートは2回おかわりしたいからsが2つ！' },
      { slideNumber: 3, slideType: 'content', questionJp: '"advice"と"advise"、動詞はどっち？', optionA: 'advice', optionB: 'advise', optionC: 'どっちも動詞', correctOption: 'B', answerEn: 'advise (動詞) / advice (名詞)', answerJp: 'アドバイスする / アドバイス', explanation: '"advise"[アドヴァイズ]が動詞、"advice"[アドヴァイス]が名詞。発音も微妙に違う。' },
      { slideNumber: 4, slideType: 'content', questionJp: '"affect"と"effect"、「影響を与える」はどっち？', optionA: 'affect', optionB: 'effect', optionC: 'どっちでもOK', correctOption: 'A', answerEn: 'affect (動詞)', answerJp: '影響を与える', explanation: '"affect"は動詞「影響する」、"effect"は名詞「影響・効果」。A=Action(動詞)、E=End result(名詞)と覚えよう。' },
      { slideNumber: 5, slideType: 'content', questionJp: '"compliment"と"complement"、褒めるはどっち？', optionA: 'compliment', optionB: 'complement', optionC: 'どっちも同じ意味', correctOption: 'A', answerEn: 'compliment', answerJp: '褒める', explanation: '"compliment"は褒め言葉、"complement"は補完するもの。"I"は"I like you"(褒める)と覚えよう。' },
      { slideNumber: 6, slideType: 'content', questionJp: '"principal"と"principle"、校長はどっち？', optionA: 'principal', optionB: 'principle', optionC: 'どっちも同じ', correctOption: 'A', answerEn: 'principal', answerJp: '校長', explanation: '"principal"は「校長/主要な」、"principle"は「原則」。校長は友達(pal)だから"principal"と覚えよう。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 13,
    type: 'quiz',
    title: 'カフェの注文\nこれ英語で言える？',
    subtitle: '海外カフェで困らない英語力',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', questionJp: '「ホットのMサイズ」って英語で？', optionA: 'Hot M size, please', optionB: 'A medium hot coffee, please', optionC: 'Can I get a medium, hot?', correctOption: 'C', answerEn: 'Can I get a medium, hot?', answerJp: 'Mサイズのホットください', explanation: '英語のカフェではサイズ→温度の順。"M size"はジャパニーズイングリッシュ。海外では"small/medium/large"を使う。' },
      { slideNumber: 3, slideType: 'content', questionJp: '「砂糖抜きで」って英語で？', optionA: 'No sugar', optionB: 'Sugar free', optionC: 'Without sugar', correctOption: 'A', answerEn: 'No sugar, please', answerJp: '砂糖抜きで', explanation: 'カフェでの注文は"No~"がシンプルで自然。"No sugar, no milk"のように並べてもOK。' },
      { slideNumber: 4, slideType: 'content', questionJp: '「テイクアウトで」って英語で？（アメリカ）', optionA: 'Take out, please', optionB: 'To go, please', optionC: 'Carry out, please', correctOption: 'B', answerEn: 'To go, please', answerJp: 'テイクアウトで', explanation: 'アメリカでは"to go"、イギリスでは"takeaway"。"For here or to go?"と聞かれるので覚えておこう。' },
      { slideNumber: 5, slideType: 'content', questionJp: '「おすすめは何ですか？」って英語で？', optionA: "What's your recommend?", optionB: 'What do you recommend?', optionC: "What's the best menu?", correctOption: 'B', answerEn: 'What do you recommend?', answerJp: 'おすすめは何ですか？', explanation: '"recommend"は動詞なので"What do you recommend?"が正しい。"What\'s your recommendation?"もOK。' },
      { slideNumber: 6, slideType: 'content', questionJp: '「Wi-Fiのパスワード教えてください」って英語で？', optionA: 'Tell me the Wi-Fi password', optionB: "What's the Wi-Fi password?", optionC: 'Can I get the Wi-Fi password?', correctOption: 'B', answerEn: "What's the Wi-Fi password?", answerJp: 'Wi-Fiのパスワード教えてください', explanation: '"What\'s the Wi-Fi password?"がシンプルで自然。"Do you have Wi-Fi?"でWi-Fiの有無を先に確認してもOK。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 14,
    type: 'quiz',
    title: '和製英語クイズ\nこれ英語じゃないって知ってた？',
    subtitle: '海外で通じない日本語英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', questionJp: '「コンセント」の正しい英語は？', optionA: 'consent', optionB: 'outlet', optionC: 'plug', correctOption: 'B', answerEn: 'outlet (米) / socket (英)', answerJp: 'コンセント', explanation: '"consent"は「同意」の意味。壁のコンセントはアメリカで"outlet"、イギリスで"socket"。' },
      { slideNumber: 3, slideType: 'content', questionJp: '「ノートパソコン」の正しい英語は？', optionA: 'note PC', optionB: 'laptop', optionC: 'mobile computer', correctOption: 'B', answerEn: 'laptop', answerJp: 'ノートパソコン', explanation: '"laptop"は膝(lap)の上(top)に置けるPC。"note PC"は和製英語で海外では通じない。' },
      { slideNumber: 4, slideType: 'content', questionJp: '「フライドポテト」の正しい英語は？（アメリカ）', optionA: 'fried potato', optionB: 'french fries', optionC: 'potato fries', correctOption: 'B', answerEn: 'french fries (米) / chips (英)', answerJp: 'フライドポテト', explanation: 'アメリカでは"french fries"、イギリスでは"chips"。"fried potato"だと炒めたジャガイモになる。' },
      { slideNumber: 5, slideType: 'content', questionJp: '「サラリーマン」の正しい英語は？', optionA: 'salary man', optionB: 'business person', optionC: 'office worker', correctOption: 'C', answerEn: 'office worker', answerJp: 'サラリーマン / 会社員', explanation: '"office worker"が一般的。"business person"もOK。"salary man"は日本語として海外で知られているが、英語ではない。' },
      { slideNumber: 6, slideType: 'content', questionJp: '「レジ」の正しい英語は？', optionA: 'register', optionB: 'cashier', optionC: 'counter', correctOption: 'B', answerEn: 'cashier / checkout', answerJp: 'レジ', explanation: '人を指す時は"cashier"、場所は"checkout"。"Where\'s the checkout?"(レジはどこ？)のように使う。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 15,
    type: 'quiz',
    title: 'SNSでよく見る\n英語スラング、意味わかる？',
    subtitle: 'ネイティブのDMが読めるようになる',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', questionJp: '"ngl"ってどういう意味？', optionA: 'No good luck', optionB: 'Not gonna lie', optionC: 'Nice good life', correctOption: 'B', answerEn: 'Not gonna lie', answerJp: '正直に言うと', explanation: '"ngl, this is amazing"(正直、これすごい)のように使う。SNSやDMでよく見る略語。' },
      { slideNumber: 3, slideType: 'content', questionJp: '"imo"ってどういう意味？', optionA: 'I miss out', optionB: 'In my opinion', optionC: "I'm moving on", correctOption: 'B', answerEn: 'In my opinion', answerJp: '私の意見では', explanation: '"imo, you should go for it"(個人的には、やるべきだと思う)のように意見を述べる前に使う。' },
      { slideNumber: 4, slideType: 'content', questionJp: '"lowkey"ってどういう意味？', optionA: '鍵が低い', optionB: 'ちょっと / 密かに', optionC: 'テンション低い', correctOption: 'B', answerEn: 'lowkey = ちょっと / 密かに', answerJp: 'ちょっと〜 / 実は〜', explanation: '"I lowkey wanna go to Bali"(密かにバリに行きたい)。控えめな気持ちを表すスラング。反対は"highkey"。' },
      { slideNumber: 5, slideType: 'content', questionJp: '"slay"ってどういう意味？', optionA: '殺す', optionB: '最高 / イケてる', optionC: '遅い', correctOption: 'B', answerEn: 'slay = 最高 / やばい', answerJp: 'イケてる！最高！', explanation: '元は「殺す」だが、スラングでは「最高にイケてる」の褒め言葉。"You slay!"(最高！)とSNSで頻出。' },
      { slideNumber: 6, slideType: 'content', questionJp: '"no cap"ってどういう意味？', optionA: '帽子なし', optionB: 'マジで / ガチで', optionC: '制限なし', correctOption: 'B', answerEn: 'no cap = マジで', answerJp: 'ガチで / 嘘じゃなく', explanation: '"This is the best coffee, no cap"(ガチでこのコーヒー最高)。"cap"=嘘、"no cap"=嘘じゃない。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 16,
    type: 'quiz',
    title: '海外のレストランで\nこれ英語で言える？',
    subtitle: '注文で困らなくなるクイズ',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', questionJp: '「2名で予約してるんですが」って英語で？', optionA: 'I booked for two people', optionB: 'I have a reservation for two', optionC: 'Two person reservation', correctOption: 'B', answerEn: 'I have a reservation for two', answerJp: '2名で予約しています', explanation: '"I have a reservation"が定番フレーズ。名前を聞かれたら"Under [名前]"と答えよう。' },
      { slideNumber: 3, slideType: 'content', questionJp: '「アレルギーがあるんですが」って英語で？', optionA: 'I have an allergy to...', optionB: "I'm allergic to...", optionC: 'どちらもOK', correctOption: 'C', answerEn: "I'm allergic to nuts", answerJp: 'ナッツアレルギーがあります', explanation: 'どちらも正しいが"I\'m allergic to~"の方がよく使われる。海外では自己申告が基本なので覚えておこう。' },
      { slideNumber: 4, slideType: 'content', questionJp: '「これ何が入ってますか？」って英語で？', optionA: "What's inside this?", optionB: "What's in this?", optionC: 'What ingredients?', correctOption: 'B', answerEn: "What's in this?", answerJp: 'これ何が入ってますか？', explanation: '"What\'s in this?"がシンプルで自然。メニューの料理を指しながら使おう。' },
      { slideNumber: 5, slideType: 'content', questionJp: '「取り皿ください」って英語で？', optionA: 'Small plate, please', optionB: 'Can I get an extra plate?', optionC: 'Share plate, please', correctOption: 'B', answerEn: 'Can I get an extra plate?', answerJp: '取り皿をください', explanation: '"extra plate"(追加のお皿)が自然。"share plate"は通じるがあまり一般的ではない。' },
      { slideNumber: 6, slideType: 'content', questionJp: '「残りを持ち帰りたいんですが」って英語で？', optionA: 'I want to take this home', optionB: 'Can I get a doggy bag?', optionC: 'Can I get this to go?', correctOption: 'C', answerEn: 'Can I get this to go?', answerJp: '持ち帰りにできますか？', explanation: '"Can I get this to go?"が現代的で自然。"doggy bag"は古い表現。"box"を使って"Can I get a box?"もOK。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
];

// ============================================================
// Before/After型 7本
// ============================================================

const beforeAfterItems: ContentItem[] = [
  {
    id: 17,
    type: 'before_after',
    title: '日本人英語 vs\nネイティブ英語',
    subtitle: '自然な英語はこう言う',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', beforeEn: "I can't speak English", beforeJp: '英語話せません', afterEn: "My English isn't great", afterJp: '英語あまり得意じゃなくて', tip: '"can\'t speak"は完全否定で強すぎる。ネイティブは"isn\'t great"と柔らかく表現する。' },
      { slideNumber: 3, slideType: 'content', beforeEn: 'I will go to travel', beforeJp: '旅行に行きます', afterEn: "I'm going on a trip", afterJp: '旅行に行くんだ', tip: '"go to travel"は文法的に不自然。"go on a trip"が正しいコロケーション。' },
      { slideNumber: 4, slideType: 'content', beforeEn: 'I ate lunch already', beforeJp: 'もうランチ食べました', afterEn: "I've already had lunch", afterJp: 'もうランチ済ませたよ', tip: '「もう〜した」は現在完了形(have+過去分詞)を使うのが自然。過去形だと「いつ？」と聞かれやすい。' },
      { slideNumber: 5, slideType: 'content', beforeEn: 'Please teach me English', beforeJp: '英語を教えてください', afterEn: 'Could you help me with my English?', afterJp: '英語を手伝ってもらえますか？', tip: '"teach me"は先生に対して使う表現。友達なら"help me with~"の方が自然でカジュアル。' },
      { slideNumber: 6, slideType: 'content', beforeEn: "I don't have confidence", beforeJp: '自信がありません', afterEn: "I'm not confident yet", afterJp: 'まだ自信がなくて', tip: '"have confidence"は硬い表現。"I\'m not confident"の方が会話で自然。"yet"で成長中の印象に。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 18,
    type: 'before_after',
    title: '丁寧すぎて逆に変？\n英語の敬語問題',
    subtitle: '丁寧すぎると距離を感じられる',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', beforeEn: 'Could you please kindly tell me...', beforeJp: '恐れ入りますが教えていただけますか', afterEn: 'Could you tell me...?', afterJp: '教えてもらえますか？', tip: '英語は丁寧語を重ねすぎると違和感がある。"Could you~?"だけで十分丁寧。' },
      { slideNumber: 3, slideType: 'content', beforeEn: 'I would like to request your assistance', beforeJp: 'ご支援を賜りたく存じます', afterEn: 'Could you help me with this?', afterJp: 'これ手伝ってもらえますか？', tip: 'ビジネスでも"Could you help me?"で十分。日本語の丁寧さをそのまま英語にすると大げさに聞こえる。' },
      { slideNumber: 4, slideType: 'content', beforeEn: 'I am terribly sorry for the inconvenience', beforeJp: '大変ご不便をおかけして申し訳ございません', afterEn: 'Sorry about that', afterJp: 'すみませんでした', tip: '軽いミスに"terribly sorry"は重すぎる。日常のミスなら"Sorry about that"で十分。' },
      { slideNumber: 5, slideType: 'content', beforeEn: 'May I ask you a question?', beforeJp: '質問してもよろしいでしょうか', afterEn: 'Quick question...', afterJp: 'ちょっと聞いていい？', tip: '友達に"May I~?"は距離を感じさせる。"Quick question"はカジュアルに質問を切り出す定番。' },
      { slideNumber: 6, slideType: 'content', beforeEn: 'Thank you very much for your precious time', beforeJp: '貴重なお時間をいただきありがとうございます', afterEn: 'Thanks for your time', afterJp: '時間をありがとう', tip: '英語の感謝は短いほど自然。"Thanks for your time"で十分気持ちは伝わる。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 19,
    type: 'before_after',
    title: 'その英語、失礼かも？\n知らずに怒らせるNG表現',
    subtitle: '悪気はないのに誤解される英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', beforeEn: 'You should lose weight', beforeJp: '痩せた方がいいよ（直球すぎ）', afterEn: "I've been trying to eat healthier lately", afterJp: '最近ヘルシーな食事心がけてるんだ', tip: '英語圏では体型に関するコメントは超NG。自分の話として共有するのが大人の対応。' },
      { slideNumber: 3, slideType: 'content', beforeEn: 'Your English is good for a Japanese', beforeJp: '日本人にしては英語上手ですね', afterEn: 'Your English is really good!', afterJp: '英語すごく上手ですね！', tip: '"for a Japanese"は差別的に聞こえる。条件をつけずにシンプルに褒めるのがベスト。' },
      { slideNumber: 4, slideType: 'content', beforeEn: 'How old are you?', beforeJp: '何歳ですか？（初対面で）', afterEn: 'When did you graduate?', afterJp: 'いつ卒業しましたか？', tip: '英語圏では年齢を直接聞くのは失礼。どうしても知りたい場合は間接的に。でも基本聞かないのが吉。' },
      { slideNumber: 5, slideType: 'content', beforeEn: 'Why are you single?', beforeJp: 'なんで独身なの？', afterEn: 'Are you seeing anyone?', afterJp: '付き合ってる人いる？', tip: '"Why are you single?"は「何か問題があるの？」と聞こえる。"Are you seeing anyone?"は中立的な質問。' },
      { slideNumber: 6, slideType: 'content', beforeEn: 'You look tired today', beforeJp: '今日疲れてるね', afterEn: 'How are you doing today?', afterJp: '今日は調子どう？', tip: '"You look tired"は「顔色悪いよ」に聞こえる。体調を気遣うなら"How are you doing?"が安全。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 20,
    type: 'before_after',
    title: 'メールの書き出し\n日本語直訳 vs 自然な英語',
    subtitle: 'ビジネスメールが一瞬でプロっぽく',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', beforeEn: 'Dear Mr. Smith, I am writing to inform you that...', beforeJp: 'スミス様、お知らせ申し上げます...', afterEn: 'Hi John, Just a heads up...', afterJp: 'ジョンさん、お知らせです...', tip: '社内や親しい取引先なら"Hi + ファーストネーム"が主流。"Dear"は超フォーマルな場面だけ。' },
      { slideNumber: 3, slideType: 'content', beforeEn: 'I am sorry to bother you', beforeJp: 'お忙しいところ恐れ入りますが', afterEn: "Hope you're doing well", afterJp: 'お世話になっております', tip: '"I am sorry to bother you"は「迷惑かけてごめん」と謝っている印象。"Hope you\'re doing well"が自然。' },
      { slideNumber: 4, slideType: 'content', beforeEn: 'As soon as possible', beforeJp: 'できるだけ早く', afterEn: 'By [具体的な日付], if possible', afterJp: '[日付]までにお願いできれば', tip: '"ASAP"はプレッシャーを与える表現。具体的な締切を伝える方が相手も動きやすい。' },
      { slideNumber: 5, slideType: 'content', beforeEn: 'Please confirm the receipt of this email', beforeJp: 'メール受領のご確認をお願いします', afterEn: 'Let me know if you have any questions', afterJp: '質問があれば教えてください', tip: '英語圏では「受領確認」の文化が薄い。「質問あれば聞いて」の方が親切で自然。' },
      { slideNumber: 6, slideType: 'content', beforeEn: 'Yours sincerely', beforeJp: '敬具', afterEn: 'Best / Cheers / Thanks', afterJp: 'よろしくお願いします', tip: '"Yours sincerely"はかなりフォーマル。日常業務なら"Best"、カジュアルなら"Cheers"(英)や"Thanks"。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 21,
    type: 'before_after',
    title: '日本語の発想で話すと\n変に聞こえる英語',
    subtitle: '考え方を切り替えるだけで自然に',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', beforeEn: 'I want to go to there', beforeJp: 'そこに行きたい', afterEn: 'I want to go there', afterJp: 'そこに行きたい', tip: '"go to"の後に"there/here/home"は不要。"go there"/"go home"が正しい。日本語の「〜に」を直訳しがち。' },
      { slideNumber: 3, slideType: 'content', beforeEn: 'I enjoyed very much', beforeJp: 'とても楽しかった', afterEn: 'I really enjoyed it', afterJp: 'すごく楽しかった', tip: '"enjoy"は他動詞なので目的語(it/the party等)が必要。"very much"より"really"が会話では自然。' },
      { slideNumber: 4, slideType: 'content', beforeEn: "I can't eat spicy food", beforeJp: '辛い食べ物食べられない', afterEn: "I don't do well with spicy food", afterJp: '辛いの苦手なんです', tip: '"can\'t eat"は物理的に食べられない印象。"don\'t do well with~"は好みの問題として自然に伝わる。' },
      { slideNumber: 5, slideType: 'content', beforeEn: 'My hobby is watching movies', beforeJp: '趣味は映画鑑賞です', afterEn: "I'm really into movies", afterJp: '映画にハマってるんだ', tip: '"My hobby is~"は子供っぽく聞こえる。"I\'m into~"や"I enjoy~"が大人の英語。' },
      { slideNumber: 6, slideType: 'content', beforeEn: 'I will do my best', beforeJp: '頑張ります', afterEn: "I'll give it my best shot", afterJp: '全力でやってみるよ', tip: '"do my best"は通じるが少し直訳的。"give it my best shot"は「挑戦する」ニュアンスがあってカッコいい。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 22,
    type: 'before_after',
    title: '直訳すると通じない\n日本語表現5選',
    subtitle: '英語脳への切り替えスイッチ',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', beforeEn: 'I have a high tension', beforeJp: 'テンション高い', afterEn: "I'm so hyped / I'm pumped", afterJp: 'めっちゃテンション上がってる', tip: '"tension"は英語で「緊張・緊迫感」。テンションが高い="excited/hyped/pumped"を使おう。' },
      { slideNumber: 3, slideType: 'content', beforeEn: "Let's play together", beforeJp: '一緒に遊ぼう', afterEn: "Let's hang out", afterJp: '一緒に遊ぼう', tip: '大人同士で"play"は子供っぽい。"hang out"が「遊ぶ/一緒に過ごす」のカジュアル表現。' },
      { slideNumber: 4, slideType: 'content', beforeEn: 'I have a skinship', beforeJp: 'スキンシップがある', afterEn: "We're pretty affectionate", afterJp: 'スキンシップが多い方だよ', tip: '"skinship"は和製英語。英語では"physical affection"や"affectionate"を使う。' },
      { slideNumber: 5, slideType: 'content', beforeEn: "I'm a naive person", beforeJp: '私はナイーブな性格です', afterEn: "I'm a sensitive person", afterJp: '私は繊細な性格です', tip: '"naive"は英語で「世間知らず・無知」のネガティブ意味。繊細="sensitive"が正しい。' },
      { slideNumber: 6, slideType: 'content', beforeEn: 'I got a claim from a customer', beforeJp: 'お客様からクレームが来た', afterEn: 'I got a complaint from a customer', afterJp: 'お客様から苦情が来た', tip: '"claim"は「主張・要求」。苦情は"complaint"。日本語の「クレーム」は和製英語的な使い方。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 23,
    type: 'before_after',
    title: '謝りすぎ？日本人の\nSorry多用問題',
    subtitle: 'Sorryの代わりに使える表現',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', beforeEn: 'Sorry, can I ask you something?', beforeJp: 'すみません、聞いてもいいですか？', afterEn: 'Excuse me, can I ask you something?', afterJp: 'すみません、聞いてもいいですか？', tip: '声をかける時の「すみません」は"Excuse me"。"Sorry"だと「ごめんなさい」になる。' },
      { slideNumber: 3, slideType: 'content', beforeEn: 'Sorry for the late reply', beforeJp: '返信遅れてすみません', afterEn: 'Thanks for your patience', afterJp: 'お待ちいただきありがとうございます', tip: '謝罪→感謝に変換するとポジティブになる。英語圏ではこのテクニックがよく使われる。' },
      { slideNumber: 4, slideType: 'content', beforeEn: "Sorry, I don't understand", beforeJp: 'すみません、わかりません', afterEn: 'Could you say that again?', afterJp: 'もう一度言ってもらえますか？', tip: '理解できない時に謝る必要はない。"Could you say that again?"と聞き返すのが自然。' },
      { slideNumber: 5, slideType: 'content', beforeEn: 'Sorry to interrupt', beforeJp: '話の途中ですみません', afterEn: 'Quick thought on that...', afterJp: 'それについて一つ...', tip: '会議で発言する時にいちいち謝らなくてOK。"Quick thought"や"If I may..."で自然に割り込める。' },
      { slideNumber: 6, slideType: 'content', beforeEn: 'Sorry, could you repeat that?', beforeJp: 'すみません、もう一度言ってもらえますか', afterEn: "I didn't catch that. One more time?", afterJp: '聞き取れなかった。もう一回お願い！', tip: '"I didn\'t catch that"は「聞き取れなかった」の自然な表現。"Sorry"なしで全然OK。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
];

// ============================================================
// シチュエーション型 7本
// ============================================================

const situationItems: ContentItem[] = [
  {
    id: 24,
    type: 'situation',
    title: 'バリのカフェで\n使える英語',
    subtitle: '現地で実際に使えるフレーズ',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', scene: 'バリ島のおしゃれなカフェ、ヤシの木が見える窓際', sceneTitle: '注文する', phraseEn1: 'Can I get an iced latte, please?', phraseJp1: 'アイスラテください', responseEn: 'Sure! For here or to go?', responseJp: 'もちろん！店内ですか？', point: '"Can I get~?"はカジュアルな注文の定番。"I\'d like~"はもう少し丁寧。' },
      { slideNumber: 3, slideType: 'content', scene: 'カフェのカウンター前', sceneTitle: 'Wi-Fiを聞く', phraseEn1: 'Do you have Wi-Fi here?', phraseJp1: 'Wi-Fiありますか？', responseEn: 'Yes! The password is on the receipt.', responseJp: 'はい！パスワードはレシートに書いてあります', point: 'バリのカフェはWi-Fi完備が多い。パスワードはレシートやテーブルに書いてあることが多い。' },
      { slideNumber: 4, slideType: 'content', scene: 'カフェのテーブルで作業中', sceneTitle: '席を確保する', phraseEn1: 'Is it okay if I stay for a while?', phraseJp1: '少し長居しても大丈夫ですか？', responseEn: 'Of course! Take your time.', responseJp: 'もちろん！ゆっくりどうぞ', point: 'バリのカフェは長居OK文化。でも一言聞くと好印象。追加注文すればさらにGood。' },
      { slideNumber: 5, slideType: 'content', scene: 'カフェのカウンター', sceneTitle: 'おすすめを聞く', phraseEn1: "What's your most popular drink?", phraseJp1: '一番人気のドリンクは何ですか？', responseEn: 'Our coconut cold brew is the best seller!', responseJp: 'ココナッツコールドブリューが一番人気です！', point: '"popular"(人気)や"best seller"(一番売れてる)で聞くと、おすすめが返ってくる。' },
      { slideNumber: 6, slideType: 'content', scene: 'カフェの会計レジ', sceneTitle: '会計する', phraseEn1: 'Can I pay by card?', phraseJp1: 'カード使えますか？', responseEn: 'Sorry, cash only at this location.', responseJp: 'すみません、ここは現金のみです', point: 'バリは現金のみの店もまだ多い。"Do you take card?"も同じ意味で使える。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 25,
    type: 'situation',
    title: 'バリの市場(パサール)で\n値切る英語',
    subtitle: 'ローカル市場を10倍楽しむ方法',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', scene: 'バリ島のカラフルなローカル市場', sceneTitle: '値段を聞く', phraseEn1: 'How much is this?', phraseJp1: 'これいくらですか？', responseEn: 'That one? 200,000 rupiah.', responseJp: 'それ？20万ルピアだよ', point: 'まずは値段を確認。観光客価格で最初は高めに言われることが多い。' },
      { slideNumber: 3, slideType: 'content', scene: '市場の雑貨屋台', sceneTitle: '値切り開始', phraseEn1: "That's a bit too much. How about 100,000?", phraseJp1: 'ちょっと高いなぁ。10万ルピアでどう？', responseEn: 'Hmm, 150,000. Best price!', responseJp: 'うーん、15万。これが最安値！', point: '最初は半額くらいから交渉スタートがバリの相場。笑顔で楽しみながら値切ろう。' },
      { slideNumber: 4, slideType: 'content', scene: '市場でお土産を見ている', sceneTitle: 'まとめ買い交渉', phraseEn1: 'If I buy three, can you give me a discount?', phraseJp1: '3つ買ったら安くしてくれる？', responseEn: 'Okay, 3 for 350,000!', responseJp: 'OK、3つで35万ルピア！', point: 'まとめ買いは値切りの最強テクニック。"bulk discount"(まとめ割)という言葉も覚えておこう。' },
      { slideNumber: 5, slideType: 'content', scene: '市場の通路', sceneTitle: '立ち去りテクニック', phraseEn1: "I'll think about it. Thank you!", phraseJp1: 'ちょっと考えるね。ありがとう！', responseEn: 'Wait wait! Okay, 120,000! Final price!', responseJp: '待って待って！12万でいいよ！最終価格！', point: '立ち去ろうとすると値段が下がることが多い。これもバリの市場文化の一つ。' },
      { slideNumber: 6, slideType: 'content', scene: '市場の果物屋台', sceneTitle: '支払い', phraseEn1: 'Do you have change for 500,000?', phraseJp1: '50万ルピア札のお釣りありますか？', responseEn: "Let me check... Yes, here's your change.", responseJp: '確認するね...はい、お釣りどうぞ', point: 'バリでは大きな紙幣だとお釣りがないことも。小額紙幣を多めに持ち歩こう。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 26,
    type: 'situation',
    title: 'バリのビーチで\n使える英語',
    subtitle: 'サーフィン・ビーチアクティビティ編',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', scene: 'バリ島のクタビーチ、サーフボードが並ぶ', sceneTitle: 'サーフレッスンを予約', phraseEn1: "I'd like to book a surf lesson. Is tomorrow available?", phraseJp1: 'サーフレッスン予約したいんですが。明日空いてますか？', responseEn: 'Sure! Morning or afternoon?', responseJp: 'もちろん！午前と午後どっちがいい？', point: '"book a lesson"で予約。"available"は「空いている」の万能ワード。' },
      { slideNumber: 3, slideType: 'content', scene: 'ビーチでサーフボードの前', sceneTitle: 'レッスン中の質問', phraseEn1: 'Is this the right position?', phraseJp1: 'このポジションで合ってますか？', responseEn: 'Almost! Move your feet a bit forward.', responseJp: 'ほぼOK！足をもう少し前に。', point: 'レッスン中は恥ずかしがらずに質問しよう。"Am I doing this right?"も使える。' },
      { slideNumber: 4, slideType: 'content', scene: 'ビーチのパラソル前', sceneTitle: 'ビーチチェアを借りる', phraseEn1: 'How much for a sunbed for the day?', phraseJp1: 'ビーチチェア1日いくらですか？', responseEn: '50,000 rupiah. Comes with an umbrella!', responseJp: '5万ルピア。パラソル付きだよ！', point: '"sunbed"や"beach chair"でOK。1日料金を確認してから借りよう。' },
      { slideNumber: 5, slideType: 'content', scene: 'ビーチの夕暮れ', sceneTitle: 'サンセットを楽しむ', phraseEn1: 'What time does the sun set today?', phraseJp1: '今日の日没は何時ですか？', responseEn: 'Around 6:15. Best spot is over there!', responseJp: '6時15分くらい。あっちがベストスポットだよ！', point: 'バリの夕日は世界一美しいと言われる。"sunset"は会話の鉄板ネタ。' },
      { slideNumber: 6, slideType: 'content', scene: 'ビーチバーでドリンクを持って', sceneTitle: 'ビーチバーで注文', phraseEn1: 'Can I get a fresh coconut?', phraseJp1: 'ヤシの実ジュースください', responseEn: 'Coming right up!', responseJp: 'すぐ持ってくるね！', point: '"fresh coconut"(生ココナッツ)はバリビーチの定番。"young coconut"とも言う。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 27,
    type: 'situation',
    title: '海外の空港で\n使える英語',
    subtitle: '入国審査〜タクシーまで完全攻略',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', scene: '空港の入国審査カウンター', sceneTitle: '入国審査', phraseEn1: "I'm here for vacation.", phraseJp1: '観光で来ました', responseEn: 'How long are you staying?', responseJp: 'どのくらい滞在しますか？', point: '入国目的を聞かれたら"vacation"(観光)/"business"(仕事)。滞在期間も準備しておこう。' },
      { slideNumber: 3, slideType: 'content', scene: '空港のバゲージクレーム', sceneTitle: '荷物が出てこない', phraseEn1: "My luggage hasn't come out yet. Can you help me?", phraseJp1: '荷物がまだ出てこないんですが', responseEn: 'Can I see your baggage claim tag?', responseJp: '手荷物引換証を見せてもらえますか？', point: '"baggage claim tag"は搭乗券に付いてるシール。なくさないように。' },
      { slideNumber: 4, slideType: 'content', scene: '空港の到着ロビー', sceneTitle: '両替する', phraseEn1: "I'd like to exchange Japanese yen to rupiah.", phraseJp1: '日本円をルピアに両替したいです', responseEn: "Today's rate is 1 yen to 105 rupiah.", responseJp: '今日のレートは1円=105ルピアです', point: '"exchange"は両替。空港より街中の方がレートが良いことが多い。' },
      { slideNumber: 5, slideType: 'content', scene: '空港のタクシー乗り場', sceneTitle: 'タクシーに乗る', phraseEn1: 'Can you take me to this address?', phraseJp1: 'この住所まで行けますか？', responseEn: 'Sure. It will take about 30 minutes.', responseJp: 'はい。30分くらいかかりますよ', point: '住所をスマホで見せるのが確実。"How much will it cost?"で料金も事前に確認しよう。' },
      { slideNumber: 6, slideType: 'content', scene: 'タクシーの車内', sceneTitle: '目的地の確認', phraseEn1: 'Is this the right way to Ubud?', phraseJp1: 'ウブドへはこの道で合ってますか？', responseEn: "Yes! We'll be there in 20 minutes.", responseJp: 'はい！あと20分で着きます', point: 'Googleマップで経路を確認しながら乗ると安心。遠回りされた時も指摘しやすい。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 28,
    type: 'situation',
    title: 'ホテルのチェックインで\n使える英語',
    subtitle: 'スムーズなチェックインの秘訣',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', scene: 'バリ島のリゾートホテルのフロント', sceneTitle: 'チェックイン', phraseEn1: 'I have a reservation under the name Tanaka.', phraseJp1: '田中で予約しています', responseEn: 'Welcome! May I see your ID, please?', responseJp: 'ようこそ！身分証明書を見せていただけますか？', point: '"under the name~"は「〜の名前で」の定型。パスポートを見せよう。' },
      { slideNumber: 3, slideType: 'content', scene: 'ホテルのフロント', sceneTitle: 'アーリーチェックイン', phraseEn1: 'Is it possible to check in early?', phraseJp1: 'アーリーチェックインできますか？', responseEn: 'Let me check... Your room is ready! You can check in now.', responseJp: '確認しますね...お部屋の準備できてます！今チェックインできますよ', point: '"Is it possible to~?"は丁寧にお願いする万能フレーズ。ダメもとで聞いてみよう。' },
      { slideNumber: 4, slideType: 'content', scene: 'ホテルの部屋', sceneTitle: '部屋のリクエスト', phraseEn1: 'Could I get some extra towels?', phraseJp1: 'タオルを追加でもらえますか？', responseEn: "Of course! I'll send them right up.", responseJp: 'もちろん！すぐお届けします', point: '"extra"は「追加の」。タオル、枕、毛布...何でも"Could I get some extra~?"で頼める。' },
      { slideNumber: 5, slideType: 'content', scene: 'ホテルのプールサイド', sceneTitle: '施設について聞く', phraseEn1: 'What time does the pool close?', phraseJp1: 'プールは何時に閉まりますか？', responseEn: 'The pool is open until 9 PM.', responseJp: 'プールは夜9時まで利用可能です', point: '"What time does ~ close/open?"は施設の時間を聞く定番。朝食時間もこれで聞ける。' },
      { slideNumber: 6, slideType: 'content', scene: 'ホテルのフロント、チェックアウト', sceneTitle: 'チェックアウト', phraseEn1: "I'd like to check out. Can I leave my luggage here?", phraseJp1: 'チェックアウトお願いします。荷物預けられますか？', responseEn: "Sure! We'll keep it at the front desk.", responseJp: 'もちろん！フロントでお預かりします', point: 'チェックアウト後も荷物を預けられるホテルが多い。フライトまで時間がある時に便利。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 29,
    type: 'situation',
    title: 'Grabタクシーで\n使える英語',
    subtitle: 'バリの移動で困らない英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', scene: 'バリの道端でスマホを見ている', sceneTitle: 'ドライバーに電話', phraseEn1: "Hi, I'm waiting in front of the convenience store.", phraseJp1: 'コンビニの前で待ってます', responseEn: "OK, I'm coming. 2 minutes!", responseJp: 'OK、向かってます。2分！', point: 'Grabでは乗車前にドライバーと電話/チャットすることが多い。目印を伝えよう。' },
      { slideNumber: 3, slideType: 'content', scene: 'Grabの車内', sceneTitle: '目的地の確認', phraseEn1: "We're going to Tanah Lot Temple, right?", phraseJp1: 'タナロット寺院で合ってますよね？', responseEn: 'Yes! About 40 minutes from here.', responseJp: 'はい！ここから40分くらいです', point: '乗車したら目的地を確認するのが安全。アプリの地図も一緒に確認しよう。' },
      { slideNumber: 4, slideType: 'content', scene: 'Grabの車内、エアコンの吹き出し口', sceneTitle: 'エアコンの調整', phraseEn1: "Could you turn up the AC a bit? It's a little warm.", phraseJp1: 'エアコンもう少し強くしてもらえますか？', responseEn: 'Sure, no problem!', responseJp: 'もちろん、いいよ！', point: '"turn up"(強く)/"turn down"(弱く)はエアコンや音楽に使える。"AC"はair conditioningの略。' },
      { slideNumber: 5, slideType: 'content', scene: '車内からバリの景色', sceneTitle: 'おすすめを聞く', phraseEn1: 'Do you know any good local restaurants around here?', phraseJp1: 'この辺でおすすめのローカルレストラン知ってますか？', responseEn: "There's a great warung near Tanah Lot! Very cheap and delicious.", responseJp: 'タナロットの近くにいいワルン(食堂)があるよ！安くて美味しい', point: 'ドライバーにおすすめを聞くのは最高のローカル情報収集法。"warung"はバリの食堂。' },
      { slideNumber: 6, slideType: 'content', scene: '目的地に到着、車から降りる', sceneTitle: '降車時', phraseEn1: 'You can drop me off right here. Thank you!', phraseJp1: 'ここで降ろしてもらって大丈夫です。ありがとう！', responseEn: 'Have a great day!', responseJp: '良い1日を！', point: '"drop me off"は「降ろしてもらう」の定番。Grabは事前決済なので降りるだけでOK。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 30,
    type: 'situation',
    title: 'バリのスパで\n使える英語',
    subtitle: '極上リラックス体験を英語で',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', scene: 'バリ島のスパの受付、花が飾られている', sceneTitle: '予約・受付', phraseEn1: 'Do you have any availability for a massage today?', phraseJp1: '今日マッサージの空きありますか？', responseEn: "Let me check... We have a slot at 3 PM.", responseJp: '確認しますね...3時に空きがあります', point: '"availability"は「空き」の丁寧な聞き方。"Do you have an opening?"もOK。' },
      { slideNumber: 3, slideType: 'content', scene: 'スパのメニューを見ている', sceneTitle: 'メニューを選ぶ', phraseEn1: "What's the difference between the 60-minute and 90-minute package?", phraseJp1: '60分と90分コースの違いは何ですか？', responseEn: 'The 90-minute includes a foot bath and hot stone treatment.', responseJp: '90分はフットバスとホットストーンが付きます', point: '"What\'s the difference between A and B?"は比較の万能フレーズ。' },
      { slideNumber: 4, slideType: 'content', scene: 'マッサージルーム', sceneTitle: '施術中のリクエスト', phraseEn1: 'Could you go a bit harder on my shoulders?', phraseJp1: '肩をもう少し強くお願いできますか？', responseEn: 'Like this? Is this okay?', responseJp: 'こんな感じ？大丈夫ですか？', point: '"harder"(強く)/"softer"(弱く)で力加減を伝えよう。"That\'s perfect!"(完璧！)で伝わる。' },
      { slideNumber: 5, slideType: 'content', scene: 'スパのリラクゼーションルーム', sceneTitle: '感想を伝える', phraseEn1: 'That was absolutely amazing. I feel so relaxed!', phraseJp1: '最高でした。すごくリラックスできました！', responseEn: "Thank you! We're glad you enjoyed it.", responseJp: 'ありがとうございます！楽しんでいただけて嬉しいです', point: '感想を伝えるとスタッフも喜ぶ。"amazing"/"wonderful"/"incredible"で大げさに褒めてOK。' },
      { slideNumber: 6, slideType: 'content', scene: 'スパの受付、会計', sceneTitle: 'チップを渡す', phraseEn1: "This is for you. Thank you for a wonderful experience!", phraseJp1: 'これどうぞ。素敵な体験をありがとう！', responseEn: "Oh, thank you so much! That's very kind.", responseJp: 'わぁ、ありがとうございます！優しいですね', point: 'バリのスパではチップは義務ではないが、良いサービスには5〜10万ルピア程度渡すと喜ばれる。' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
];

// ============================================================
// ストーリー型 10本
// ============================================================

const storyItems: ContentItem[] = [
  {
    id: 31,
    type: 'story',
    title: 'バリ島で本当にあった\n英語エピソード5選',
    subtitle: '現地で体験したリアルな英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: 'ウブドの棚田にて', storyBody: '道に迷って地元の人に助けてもらった時の一言', phraseEn: 'Could you point me in the right direction?', phraseJp: '正しい方向を教えてもらえますか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: 'クタのコンビニで', storyBody: 'お釣りが足りない時に使ったフレーズ', phraseEn: 'I think the change is short.', phraseJp: 'お釣りが足りないと思います' },
      { slideNumber: 4, slideType: 'content', storyTitle: 'サヌールの薬局にて', storyBody: 'お腹を壊して薬を買いに行った時のこと', phraseEn: 'Do you have anything for an upset stomach?', phraseJp: 'お腹の薬はありますか？' },
      { slideNumber: 5, slideType: 'content', storyTitle: 'スミニャックの渋滞で', storyBody: 'Grabドライバーに別ルートを提案した時', phraseEn: 'Can we take a different route?', phraseJp: '別のルートで行けますか？' },
      { slideNumber: 6, slideType: 'content', storyTitle: 'ヌサドゥアのホテルで', storyBody: 'プールのタオルが見つからず聞いた一言', phraseEn: 'Where can I get pool towels?', phraseJp: 'プール用タオルはどこでもらえますか？' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 32,
    type: 'story',
    title: 'ウブドのカフェで\n使える英語フレーズ5選',
    subtitle: 'おしゃれカフェを満喫する英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: '席を探して', storyBody: '混んでるカフェで相席をお願いした場面', phraseEn: 'Do you mind if I sit here?', phraseJp: 'ここに座ってもいいですか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: 'メニュー選びで', storyBody: '何がおすすめか店員に聞いてみた', phraseEn: "What's your most popular drink?", phraseJp: '一番人気のドリンクは何ですか？' },
      { slideNumber: 4, slideType: 'content', storyTitle: 'Wi-Fiが必要で', storyBody: 'ノマドワーカーの必須フレーズ', phraseEn: "What's the Wi-Fi password?", phraseJp: 'Wi-Fiのパスワードは何ですか？' },
      { slideNumber: 5, slideType: 'content', storyTitle: 'オーダー変更したくて', storyBody: '注文後にやっぱり変えたくなった時', phraseEn: 'Sorry, can I change my order?', phraseJp: 'すみません、注文を変えてもいいですか？' },
      { slideNumber: 6, slideType: 'content', storyTitle: 'お会計で', storyBody: '割り勘にしたい時に使ったフレーズ', phraseEn: 'Can we split the bill?', phraseJp: '別々に会計できますか？' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 33,
    type: 'story',
    title: 'バリのタクシーで\n困らない英語5選',
    subtitle: '移動中に使えるリアル英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: '乗車前の交渉', storyBody: 'メーターを使うか確認した場面', phraseEn: 'Can you use the meter, please?', phraseJp: 'メーターを使ってもらえますか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: '目的地の説明', storyBody: '住所がわからずGoogleマップを見せた時', phraseEn: "I'll show you on my phone.", phraseJp: 'スマホで見せますね' },
      { slideNumber: 4, slideType: 'content', storyTitle: 'ウブド方面で渋滞中', storyBody: '到着時間が気になって聞いた一言', phraseEn: 'How much longer do you think?', phraseJp: 'あとどれくらいかかりそうですか？' },
      { slideNumber: 5, slideType: 'content', storyTitle: '途中で寄り道したくて', storyBody: 'ATMに寄ってほしい時に使った表現', phraseEn: 'Could you stop at an ATM on the way?', phraseJp: '途中でATMに寄ってもらえますか？' },
      { slideNumber: 6, slideType: 'content', storyTitle: '降車時に', storyBody: 'お釣りをチップとして渡した場面', phraseEn: 'Keep the change.', phraseJp: 'お釣りは取っておいてください' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 34,
    type: 'story',
    title: 'サーフショップで\n実際に使った英語5選',
    subtitle: 'チャングーのサーフシーンで使う英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: 'ボード選びで', storyBody: 'チャングーのショップで初心者用を探した時', phraseEn: 'Which board is best for beginners?', phraseJp: '初心者にはどのボードがいいですか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: 'レンタル料金の確認', storyBody: '1日いくらか聞いた場面', phraseEn: 'How much is it to rent for the whole day?', phraseJp: '1日レンタルはいくらですか？' },
      { slideNumber: 4, slideType: 'content', storyTitle: 'レッスンの相談', storyBody: 'インストラクターを紹介してもらった', phraseEn: 'Do you offer surf lessons?', phraseJp: 'サーフレッスンはやっていますか？' },
      { slideNumber: 5, slideType: 'content', storyTitle: 'ボードが壊れて', storyBody: 'リーシュが切れてしまった時の報告', phraseEn: 'The leash broke while I was surfing.', phraseJp: 'サーフィン中にリーシュが切れました' },
      { slideNumber: 6, slideType: 'content', storyTitle: '波情報を聞いて', storyBody: '明日の波のコンディションを聞いた場面', phraseEn: "What's the surf forecast for tomorrow?", phraseJp: '明日の波予報はどうですか？' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 35,
    type: 'story',
    title: 'バリの市場で\n値切るための英語5選',
    subtitle: 'ローカル市場で使える交渉術',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: '最初の値段を聞いて', storyBody: 'ウブド市場で木彫りの置物を見つけた時', phraseEn: 'How much is this one?', phraseJp: 'これはいくらですか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: '高すぎると感じて', storyBody: '言い値の半分くらいから交渉開始', phraseEn: "That's a bit too expensive. Can you do better?", phraseJp: 'ちょっと高いですね。もう少し安くなりますか？' },
      { slideNumber: 4, slideType: 'content', storyTitle: 'まとめ買いで交渉', storyBody: '3つ買うからと値下げを提案した場面', phraseEn: "I'll take three. Can you give me a discount?", phraseJp: '3つ買うので割引してもらえますか？' },
      { slideNumber: 5, slideType: 'content', storyTitle: '立ち去るフリで', storyBody: '最終手段の交渉テクニック', phraseEn: "I think I'll look around a bit more.", phraseJp: 'もう少し他も見てみます' },
      { slideNumber: 6, slideType: 'content', storyTitle: '最終合意で', storyBody: '納得の価格で握手して購入', phraseEn: "OK, deal! I'll take it.", phraseJp: 'OK、それで決まり！買います' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 36,
    type: 'story',
    title: 'バリのレストランで\nやらかした英語5選',
    subtitle: '失敗から学ぶリアル英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: '辛さの確認を忘れて', storyBody: 'サンバルたっぷりの料理が来て悶絶', phraseEn: 'Can you make it less spicy?', phraseJp: '辛さ控えめにできますか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: '注文が通ってなくて', storyBody: '30分待ったけど料理が来ない事件', phraseEn: "Excuse me, I ordered 30 minutes ago.", phraseJp: 'すみません、30分前に注文したのですが' },
      { slideNumber: 4, slideType: 'content', storyTitle: '隣のテーブルの料理を指して', storyBody: 'メニュー名がわからず指差しで注文', phraseEn: "I'll have the same as that table.", phraseJp: 'あのテーブルと同じものをください' },
      { slideNumber: 5, slideType: 'content', storyTitle: 'アレルギーを伝え忘れて', storyBody: 'ピーナッツ入りの料理が来てしまった', phraseEn: "I'm allergic to peanuts. Does this contain any?", phraseJp: 'ピーナッツアレルギーです。入ってますか？' },
      { slideNumber: 6, slideType: 'content', storyTitle: 'お会計のトラブル', storyBody: '頼んでないものが含まれていた時', phraseEn: "I didn't order this item on the bill.", phraseJp: 'この項目は注文していません' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 37,
    type: 'story',
    title: 'バリのビーチで\n聞こえてくる英語5選',
    subtitle: 'ビーチで飛び交うリアル英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: 'ビーチ売りが来て', storyBody: 'クタビーチでサングラス売りに話しかけられた', phraseEn: "No, thank you. I'm just relaxing.", phraseJp: 'いいえ、大丈夫です。くつろいでるだけです' },
      { slideNumber: 3, slideType: 'content', storyTitle: 'パラソルのレンタルで', storyBody: 'ビーチチェアの料金交渉をした場面', phraseEn: 'How much for two chairs and an umbrella?', phraseJp: 'チェア2つとパラソルでいくらですか？' },
      { slideNumber: 4, slideType: 'content', storyTitle: 'サンセットタイムに', storyBody: '隣の観光客に写真を頼まれた場面', phraseEn: 'Sure! Say cheese!', phraseJp: 'もちろん！はい、チーズ！' },
      { slideNumber: 5, slideType: 'content', storyTitle: '荷物を見てもらう時', storyBody: '泳ぎに行く前に隣の人にお願いした', phraseEn: 'Could you keep an eye on my stuff?', phraseJp: '荷物を見ていてもらえますか？' },
      { slideNumber: 6, slideType: 'content', storyTitle: '日焼け止めを借りて', storyBody: '塗り直したいけど持ってなかった時', phraseEn: 'Could I borrow some sunscreen?', phraseJp: '日焼け止めを少し借りてもいいですか？' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 38,
    type: 'story',
    title: 'バリの両替所で\n使える英語5選',
    subtitle: '両替で損しないための英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: 'レートの確認で', storyBody: 'サヌールの両替所で看板と実際のレートが違った', phraseEn: "What's today's exchange rate for Japanese yen?", phraseJp: '今日の円の両替レートはいくらですか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: '手数料を聞いて', storyBody: '「No commission」の看板を確認した場面', phraseEn: 'Is there any commission or fee?', phraseJp: '手数料はかかりますか？' },
      { slideNumber: 4, slideType: 'content', storyTitle: '金額を指定して', storyBody: '5万円分だけ両替したい時', phraseEn: 'I want to exchange 50,000 yen, please.', phraseJp: '5万円を両替したいです' },
      { slideNumber: 5, slideType: 'content', storyTitle: 'お札の確認で', storyBody: '受け取った金額をその場でカウントした時', phraseEn: 'Let me count it here, please.', phraseJp: 'ここで数えさせてください' },
      { slideNumber: 6, slideType: 'content', storyTitle: '小額紙幣が欲しくて', storyBody: '大きい紙幣だとお釣りがない店が多いので', phraseEn: 'Can I get some smaller bills?', phraseJp: '小額紙幣も混ぜてもらえますか？' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 39,
    type: 'story',
    title: 'バリの寺院巡りで\n知っておきたい英語5選',
    subtitle: '寺院観光で使えるフレーズ',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: '入場の際に', storyBody: 'ウルワツ寺院でサロンを借りた場面', phraseEn: 'Where can I get a sarong?', phraseJp: 'サロンはどこで借りられますか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: '写真撮影の確認', storyBody: '神聖な場所で撮影していいか聞いた時', phraseEn: 'Is it OK to take photos here?', phraseJp: 'ここで写真を撮っても大丈夫ですか？' },
      { slideNumber: 4, slideType: 'content', storyTitle: 'ガイドに質問して', storyBody: 'タマンアユン寺院の歴史が気になった', phraseEn: 'How old is this temple?', phraseJp: 'この寺院はどのくらい古いのですか？' },
      { slideNumber: 5, slideType: 'content', storyTitle: 'お供え物について', storyBody: 'チャナンの意味をガイドに聞いた場面', phraseEn: 'What do these offerings mean?', phraseJp: 'このお供え物にはどんな意味がありますか？' },
      { slideNumber: 6, slideType: 'content', storyTitle: 'ケチャダンスの開始時間', storyBody: 'ウルワツのケチャダンスを見たくて確認', phraseEn: 'What time does the Kecak dance start?', phraseJp: 'ケチャダンスは何時に始まりますか？' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 40,
    type: 'story',
    title: 'バリのヴィラで\nチェックイン英語5選',
    subtitle: 'プライベートヴィラで使う英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', storyTitle: '到着時に', storyBody: 'ウブドのヴィラに予定より早く着いた時', phraseEn: 'We arrived a bit early. Is the room ready?', phraseJp: '少し早く着いたのですが、部屋は準備できていますか？' },
      { slideNumber: 3, slideType: 'content', storyTitle: 'プールの確認で', storyBody: 'プライベートプールの使い方を聞いた', phraseEn: 'Is the pool available 24 hours?', phraseJp: 'プールは24時間使えますか？' },
      { slideNumber: 4, slideType: 'content', storyTitle: '朝食の手配で', storyBody: '翌朝の朝食メニューを事前に選ぶ場面', phraseEn: 'Can we choose our breakfast menu tonight?', phraseJp: '今晩のうちに朝食メニューを選べますか？' },
      { slideNumber: 5, slideType: 'content', storyTitle: 'エアコンの不調で', storyBody: '夜中にエアコンが止まって連絡した時', phraseEn: 'The air conditioning in our room stopped working.', phraseJp: '部屋のエアコンが動かなくなりました' },
      { slideNumber: 6, slideType: 'content', storyTitle: 'チェックアウト延長', storyBody: 'フライトが夜なのでレイトチェックアウトを相談', phraseEn: 'Is it possible to get a late checkout?', phraseJp: 'レイトチェックアウトは可能ですか？' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
];

// ============================================================
// 生徒あるある型 10本
// ============================================================

const studentMistakeItems: ContentItem[] = [
  {
    id: 41,
    type: 'student_mistake',
    title: '生徒が毎回間違える\n英語フレーズ5選',
    subtitle: '語学学校の現場からリアル報告',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'I will go to there.', correctEn: 'I will go there.', mistakeExplanation: 'thereは副詞なのでtoは不要です' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'I enjoyed.', correctEn: 'I enjoyed it.', mistakeExplanation: 'enjoyは他動詞。目的語itが必要' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: "I can't eat spicy.", correctEn: "I can't eat spicy food.", mistakeExplanation: 'spicyは形容詞。名詞foodが必要' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'I have ever been to Bali.', correctEn: 'I have been to Bali.', mistakeExplanation: 'everは疑問文・否定文で使うのが基本' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: 'I will explain about it.', correctEn: 'I will explain it.', mistakeExplanation: 'explainは直接目的語を取る動詞です' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 42,
    type: 'student_mistake',
    title: '日本人がやりがちな\n英語の間違い5選',
    subtitle: '日本語の発想が原因の間違い',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'Please teach me the way.', correctEn: 'Could you show me the way?', mistakeExplanation: '道案内にteachは不自然。showを使う' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: "Let's go to drink.", correctEn: "Let's go for a drink.", mistakeExplanation: '"飲みに行く"はgo for a drinkが自然' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'I am boring.', correctEn: 'I am bored.', mistakeExplanation: 'boringだと「私はつまらない人間」の意味に' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'I went to shopping.', correctEn: 'I went shopping.', mistakeExplanation: 'go shoppingでセット。toは不要' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: 'I am looking forward to see you.', correctEn: 'I am looking forward to seeing you.', mistakeExplanation: 'toは前置詞なので動名詞-ingが続く' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 43,
    type: 'student_mistake',
    title: '先生に直される\n英語あるある5選',
    subtitle: '授業中に何度も出る間違い',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'I am agree.', correctEn: 'I agree.', mistakeExplanation: 'agreeは動詞。be動詞は不要です' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'Almost people like coffee.', correctEn: 'Most people like coffee.', mistakeExplanation: 'almostは副詞。名詞の前はmostを使う' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'I could see the beautiful sea.', correctEn: 'I was able to see the beautiful sea.', mistakeExplanation: '実際にできた過去の話はwas able toが正確' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'I discussed about the problem.', correctEn: 'I discussed the problem.', mistakeExplanation: 'discussは他動詞。aboutは不要' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: "I don't have no money.", correctEn: "I don't have any money.", mistakeExplanation: '二重否定は文法的に誤り。anyを使う' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 44,
    type: 'student_mistake',
    title: '初心者が必ずハマる\n英語のワナ5選',
    subtitle: '中級への壁を越える第一歩',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'I want to go to eat Nasi Goreng.', correctEn: 'I want to go eat Nasi Goreng.', mistakeExplanation: 'go + 動詞原形が自然。toの連続は避ける' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'Do you have a time?', correctEn: 'Do you have the time?', mistakeExplanation: 'a timeだと「暇？」、the timeで「何時？」' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'I am used to live in Bali.', correctEn: 'I am used to living in Bali.', mistakeExplanation: 'be used toの後は動名詞-ingが来る' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'She said me to come.', correctEn: 'She told me to come.', mistakeExplanation: 'sayは間接目的語を取らない。tellを使う' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: "I'm interesting in Bali culture.", correctEn: "I'm interested in Bali culture.", mistakeExplanation: '-ingは物が主語。人が主語なら-ed' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 45,
    type: 'student_mistake',
    title: '直訳すると恥ずかしい\n英語5選',
    subtitle: '日本語そのままだと危険な表現',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'Please eat more.', correctEn: 'Help yourself to more.', mistakeExplanation: '命令っぽく聞こえる。Help yourselfが自然' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'My body condition is bad.', correctEn: "I'm not feeling well.", mistakeExplanation: 'body conditionは不自然。シンプルに言う' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'I have skinship with friends.', correctEn: 'I have a close bond with friends.', mistakeExplanation: 'skinshipは和製英語。通じません' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'I caught a cold, so I rest.', correctEn: "I caught a cold, so I'm resting.", mistakeExplanation: '今の状態を伝えるなら現在進行形を使う' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: "It's my first time Bali.", correctEn: "It's my first time in Bali.", mistakeExplanation: '場所の前にはinが必要です' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 46,
    type: 'student_mistake',
    title: '丁寧なつもりが\n失礼になる英語5選',
    subtitle: '知らないと損する敬語のズレ',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'You should try this restaurant.', correctEn: 'You might want to try this restaurant.', mistakeExplanation: 'shouldは上から目線に聞こえることがある' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'What is your job?', correctEn: 'What do you do for a living?', mistakeExplanation: '直球すぎる。遠回しに聞くのがマナー' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'How old are you?', correctEn: 'May I ask how old you are?', mistakeExplanation: '年齢は敏感な話題。May I ask~で丁寧に' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'Give me water.', correctEn: 'Could I have some water, please?', mistakeExplanation: 'Give meは命令口調。Could I haveが丁寧' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: 'You are wrong.', correctEn: "I don't think that's quite right.", mistakeExplanation: '直接的すぎる。婉曲表現を使おう' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 47,
    type: 'student_mistake',
    title: '文法は合ってるのに\n通じない英語5選',
    subtitle: 'ネイティブはこう言わない',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'I want to eat lunch from now.', correctEn: "Let's grab lunch.", mistakeExplanation: 'from nowは不自然。grabが日常的' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'I will do my best.', correctEn: "I'll give it my best shot.", mistakeExplanation: 'do my bestは硬い。best shotが口語的' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'I forgot my umbrella in the taxi.', correctEn: 'I left my umbrella in the taxi.', mistakeExplanation: '置き忘れはleft。forgetは記憶の話' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'The shop is close today.', correctEn: 'The shop is closed today.', mistakeExplanation: 'closeは動詞/形容詞「近い」。closedが正解' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: 'I am very fun.', correctEn: "I'm having a great time.", mistakeExplanation: 'funは物事に使う。人の感想はhaving fun' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 48,
    type: 'student_mistake',
    title: 'カタカナ英語の\n落とし穴5選',
    subtitle: 'そのカタカナ、通じません',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'I drank a Viking lunch.', correctEn: 'I had a buffet lunch.', mistakeExplanation: 'バイキングは和製英語。buffetが正解' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'The consent is broken.', correctEn: 'The outlet is broken.', mistakeExplanation: 'コンセントは和製英語。outletかsocket' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'I need to get a gasoline stand.', correctEn: 'I need to find a gas station.', mistakeExplanation: 'ガソリンスタンドは和製英語。gas station' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'I work as a salary man.', correctEn: 'I work as an office worker.', mistakeExplanation: 'サラリーマンは和製英語。office workerが自然' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: 'Can I use the cunning in the test?', correctEn: 'Can I use a cheat sheet?', mistakeExplanation: 'カンニングは和製英語。cheatingが正解' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 49,
    type: 'student_mistake',
    title: '意味が全然違う\n和製英語5選',
    subtitle: 'ネイティブに笑われる前に',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: "Let's take a claim to the hotel.", correctEn: "Let's file a complaint with the hotel.", mistakeExplanation: 'claimは「主張」。苦情はcomplaint' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'I have a mansion in Tokyo.', correctEn: 'I have a condo in Tokyo.', mistakeExplanation: 'mansionは大豪邸。マンションはcondo' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'I renewed my room.', correctEn: 'I renovated my room.', mistakeExplanation: 'renewは契約更新。部屋の改装はrenovate' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'I got a naive impression of her.', correctEn: 'I got a gentle impression of her.', mistakeExplanation: 'naiveは「世間知らず」。繊細はgentle/sensitive' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: 'The talent appeared on TV.', correctEn: 'The TV personality appeared on TV.', mistakeExplanation: 'talentは「才能」。芸能人はTV personality' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 50,
    type: 'student_mistake',
    title: 'バリの授業で\nよく出る質問5選',
    subtitle: '生徒のリアルな疑問と回答',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', mistakeNumber: '1', mistakeEn: 'What is the different?', correctEn: 'What is the difference?', mistakeExplanation: 'differentは形容詞。名詞はdifference' },
      { slideNumber: 3, slideType: 'content', mistakeNumber: '2', mistakeEn: 'Can you speak slowly?', correctEn: 'Could you speak more slowly?', mistakeExplanation: 'Couldの方が丁寧。moreも加えて自然に' },
      { slideNumber: 4, slideType: 'content', mistakeNumber: '3', mistakeEn: 'How to say this in English?', correctEn: 'How do you say this in English?', mistakeExplanation: '疑問文にはdo youが必要です' },
      { slideNumber: 5, slideType: 'content', mistakeNumber: '4', mistakeEn: 'What means "ubud"?', correctEn: 'What does "ubud" mean?', mistakeExplanation: '疑問文はdoesを使って作る' },
      { slideNumber: 6, slideType: 'content', mistakeNumber: '5', mistakeEn: 'Please say one more time.', correctEn: 'Could you say that one more time?', mistakeExplanation: 'Pleaseよりcould youが丁寧。thatも追加' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
];

// ============================================================
// バリ現地レポ型 10本
// ============================================================

const baliReportItems: ContentItem[] = [
  {
    id: 51,
    type: 'bali_report',
    title: 'ウブド市場で使える\n英語フレーズ5選',
    subtitle: 'ウブドアートマーケット攻略',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'ウブドアートマーケット', phraseEn: 'How much is this painting?', phraseJp: 'この絵はいくらですか？', usageTip: '指差しながら聞くと伝わりやすい' },
      { slideNumber: 3, slideType: 'content', locationName: 'ウブドアートマーケット', phraseEn: "Can you wrap it carefully? It's a gift.", phraseJp: '丁寧に包んでもらえますか？贈り物です', usageTip: 'giftと伝えると丁寧に包んでくれる' },
      { slideNumber: 4, slideType: 'content', locationName: 'ウブドアートマーケット', phraseEn: 'Do you accept credit cards?', phraseJp: 'クレジットカードは使えますか？', usageTip: '現金のみの店が多いので事前確認を' },
      { slideNumber: 5, slideType: 'content', locationName: 'ウブドアートマーケット', phraseEn: "What's this made of?", phraseJp: 'これは何でできていますか？', usageTip: 'バリの木彫りは素材で値段が変わる' },
      { slideNumber: 6, slideType: 'content', locationName: 'ウブドアートマーケット', phraseEn: "I'll come back later.", phraseJp: 'また後で来ます', usageTip: '値切り交渉の定番テクニック' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 52,
    type: 'bali_report',
    title: 'スミニャックの\nカフェ英語5選',
    subtitle: 'おしゃれエリアのカフェ英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'スミニャック・カフェ', phraseEn: 'Is this seat taken?', phraseJp: 'この席は空いていますか？', usageTip: '混雑時は確認してから座ろう' },
      { slideNumber: 3, slideType: 'content', locationName: 'スミニャック・カフェ', phraseEn: 'Do you have oat milk?', phraseJp: 'オーツミルクはありますか？', usageTip: 'バリのカフェは代替ミルクが充実' },
      { slideNumber: 4, slideType: 'content', locationName: 'スミニャック・カフェ', phraseEn: 'Can I get this to go?', phraseJp: 'テイクアウトできますか？', usageTip: 'to goがテイクアウトの定番表現' },
      { slideNumber: 5, slideType: 'content', locationName: 'スミニャック・カフェ', phraseEn: 'Is there a power outlet near this table?', phraseJp: 'このテーブルの近くにコンセントはありますか？', usageTip: 'ノマド必須フレーズ。plugでもOK' },
      { slideNumber: 6, slideType: 'content', locationName: 'スミニャック・カフェ', phraseEn: 'Could I see the dessert menu?', phraseJp: 'デザートメニューを見せてもらえますか？', usageTip: 'バリのスイーツは意外とレベルが高い' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 53,
    type: 'bali_report',
    title: 'クタビーチで\n使える英語5選',
    subtitle: 'バリ最大のビーチで使う英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'クタビーチ', phraseEn: 'Is it safe to swim here?', phraseJp: 'ここで泳いでも安全ですか？', usageTip: '旗の色を確認。赤旗は遊泳禁止' },
      { slideNumber: 3, slideType: 'content', locationName: 'クタビーチ', phraseEn: 'Where can I rent a surfboard?', phraseJp: 'サーフボードはどこで借りられますか？', usageTip: 'ビーチ沿いにレンタル店が多数ある' },
      { slideNumber: 4, slideType: 'content', locationName: 'クタビーチ', phraseEn: 'How much for a one-hour surf lesson?', phraseJp: '1時間のサーフレッスンはいくらですか？', usageTip: '相場を聞いてから交渉するのがコツ' },
      { slideNumber: 5, slideType: 'content', locationName: 'クタビーチ', phraseEn: 'What time is sunset today?', phraseJp: '今日のサンセットは何時ですか？', usageTip: 'クタビーチの夕日は必見スポット' },
      { slideNumber: 6, slideType: 'content', locationName: 'クタビーチ', phraseEn: 'Can I leave my things at your shop?', phraseJp: '荷物をお店に置いてもいいですか？', usageTip: '海に入る前に近くの店に預ける人が多い' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 54,
    type: 'bali_report',
    title: 'バリ空港で\n困らない英語5選',
    subtitle: 'ングラ・ライ国際空港で使う英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'ングラ・ライ国際空港', phraseEn: "I'm here for vacation.", phraseJp: '観光で来ました', usageTip: '入国審査で目的を聞かれた時の定番' },
      { slideNumber: 3, slideType: 'content', locationName: 'ングラ・ライ国際空港', phraseEn: 'Where is the baggage claim area?', phraseJp: '手荷物受取所はどこですか？', usageTip: 'baggageとluggageは同じ意味で使える' },
      { slideNumber: 4, slideType: 'content', locationName: 'ングラ・ライ国際空港', phraseEn: 'Where can I buy a SIM card?', phraseJp: 'SIMカードはどこで買えますか？', usageTip: '到着ロビーにSIM販売カウンターがある' },
      { slideNumber: 5, slideType: 'content', locationName: 'ングラ・ライ国際空港', phraseEn: 'How do I get to Ubud from here?', phraseJp: 'ここからウブドへはどう行きますか？', usageTip: '空港タクシーかGrabが一般的' },
      { slideNumber: 6, slideType: 'content', locationName: 'ングラ・ライ国際空港', phraseEn: "I'd like to declare these items.", phraseJp: 'これらの品を申告したいです', usageTip: '免税範囲を超える場合は正直に申告を' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 55,
    type: 'bali_report',
    title: 'ヌサドゥアリゾートの\n英語フレーズ5選',
    subtitle: '高級リゾートエリアで使う英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'ヌサドゥアリゾート', phraseEn: 'Can I book a cabana by the pool?', phraseJp: 'プールサイドのカバナを予約できますか？', usageTip: 'カバナは人気なので早めの予約が安心' },
      { slideNumber: 3, slideType: 'content', locationName: 'ヌサドゥアリゾート', phraseEn: 'Is the spa included in the room package?', phraseJp: 'スパは宿泊プランに含まれていますか？', usageTip: 'パッケージ内容は事前に確認しよう' },
      { slideNumber: 4, slideType: 'content', locationName: 'ヌサドゥアリゾート', phraseEn: 'Could you arrange a shuttle to the beach?', phraseJp: 'ビーチまでのシャトルを手配してもらえますか？', usageTip: '大型リゾートはシャトルサービスがある' },
      { slideNumber: 5, slideType: 'content', locationName: 'ヌサドゥアリゾート', phraseEn: 'Do you have a kids club?', phraseJp: 'キッズクラブはありますか？', usageTip: '家族連れに人気のエリアならではの質問' },
      { slideNumber: 6, slideType: 'content', locationName: 'ヌサドゥアリゾート', phraseEn: "I'd like to make a dinner reservation for tonight.", phraseJp: '今夜のディナーを予約したいです', usageTip: '人気レストランは当日でも予約がベター' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 56,
    type: 'bali_report',
    title: 'チャングーの\nサーフスポット英語5選',
    subtitle: 'サーファーの聖地で使う英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'チャングー・バトゥボロン', phraseEn: "How's the surf today?", phraseJp: '今日の波はどうですか？', usageTip: 'ローカルに聞くのが一番正確' },
      { slideNumber: 3, slideType: 'content', locationName: 'チャングー・エコビーチ', phraseEn: 'Is there a strong current right now?', phraseJp: '今、強い流れはありますか？', usageTip: '安全確認は必ずしよう。currentは潮流' },
      { slideNumber: 4, slideType: 'content', locationName: 'チャングー・ベラワ', phraseEn: 'Can I store my board here overnight?', phraseJp: 'ボードを一晩預けられますか？', usageTip: 'ショップで預かりサービスがある場合も' },
      { slideNumber: 5, slideType: 'content', locationName: 'チャングー・ペレレナン', phraseEn: "I'm still a beginner. Any tips?", phraseJp: 'まだ初心者です。コツはありますか？', usageTip: 'ローカルサーファーは親切に教えてくれる' },
      { slideNumber: 6, slideType: 'content', locationName: 'チャングー・オールドマンズ', phraseEn: 'What time does the tide come in?', phraseJp: '満潮は何時ですか？', usageTip: '潮の満ち引きで波質が変わる' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 57,
    type: 'bali_report',
    title: 'サヌールの朝市で\n使える英語5選',
    subtitle: 'ローカル朝市を楽しむ英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'サヌール・モーニングマーケット', phraseEn: 'What kind of fruit is this?', phraseJp: 'これは何のフルーツですか？', usageTip: '見たことない南国フルーツがたくさん' },
      { slideNumber: 3, slideType: 'content', locationName: 'サヌール・モーニングマーケット', phraseEn: 'Can I try a sample?', phraseJp: '試食できますか？', usageTip: '指差して聞けばOKしてくれることが多い' },
      { slideNumber: 4, slideType: 'content', locationName: 'サヌール・モーニングマーケット', phraseEn: 'How much for a kilo of mangoes?', phraseJp: 'マンゴー1キロはいくらですか？', usageTip: 'バリの市場は量り売りが基本' },
      { slideNumber: 5, slideType: 'content', locationName: 'サヌール・モーニングマーケット', phraseEn: 'Is this locally grown?', phraseJp: 'これは地元で採れたものですか？', usageTip: 'locallyを使うと現地産か聞ける' },
      { slideNumber: 6, slideType: 'content', locationName: 'サヌール・モーニングマーケット', phraseEn: "Do you have a bag? I'll buy these.", phraseJp: '袋はありますか？これ買います', usageTip: 'エコバッグ持参がベター' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 58,
    type: 'bali_report',
    title: 'ウルワツ寺院で\n知っておく英語5選',
    subtitle: '断崖絶壁の絶景寺院で使う英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'ウルワツ寺院', phraseEn: 'Are there monkeys around here?', phraseJp: 'この辺にサルはいますか？', usageTip: 'サルにメガネや帽子を取られる被害多発' },
      { slideNumber: 3, slideType: 'content', locationName: 'ウルワツ寺院', phraseEn: 'Do I need to wear a sarong to enter?', phraseJp: '入場にサロンは必要ですか？', usageTip: '寺院では肌の露出を控える服装が必須' },
      { slideNumber: 4, slideType: 'content', locationName: 'ウルワツ寺院', phraseEn: 'Where is the best spot to watch the sunset?', phraseJp: 'サンセットを見るベストスポットはどこですか？', usageTip: '早めに場所を確保するのがポイント' },
      { slideNumber: 5, slideType: 'content', locationName: 'ウルワツ寺院', phraseEn: 'How long does the Kecak dance last?', phraseJp: 'ケチャダンスはどのくらいの時間ですか？', usageTip: '約1時間。開始30分前には着席を' },
      { slideNumber: 6, slideType: 'content', locationName: 'ウルワツ寺院', phraseEn: 'Where can I catch a taxi after the show?', phraseJp: 'ショーの後タクシーはどこで拾えますか？', usageTip: '終演後は混むので事前に確認しておこう' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 59,
    type: 'bali_report',
    title: 'バリのスパで\n使える英語5選',
    subtitle: '極上リラクゼーション英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'バリ島スパ', phraseEn: 'Do you have a couples treatment?', phraseJp: 'カップル向けの施術はありますか？', usageTip: 'バリのスパはカップルプランが豊富' },
      { slideNumber: 3, slideType: 'content', locationName: 'バリ島スパ', phraseEn: "I have sensitive skin. Is that OK?", phraseJp: '敏感肌なのですが大丈夫ですか？', usageTip: '事前に伝えるとオイルを変えてくれる' },
      { slideNumber: 4, slideType: 'content', locationName: 'バリ島スパ', phraseEn: 'A bit softer on my lower back, please.', phraseJp: '腰はもう少し優しくお願いします', usageTip: '部位+強さを伝えれば調整してくれる' },
      { slideNumber: 5, slideType: 'content', locationName: 'バリ島スパ', phraseEn: 'Which treatment do you recommend for jet lag?', phraseJp: '時差ボケにおすすめの施術はどれですか？', usageTip: 'アロマやリフレクソロジーを勧められる' },
      { slideNumber: 6, slideType: 'content', locationName: 'バリ島スパ', phraseEn: 'Can I book the same therapist for next time?', phraseJp: '次回も同じセラピストを指名できますか？', usageTip: '気に入ったら指名するのがおすすめ' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
  {
    id: 60,
    type: 'bali_report',
    title: 'ジンバランの\nシーフードBBQ英語5選',
    subtitle: 'ビーチBBQを楽しむ英語',
    slides: [
      { slideNumber: 1, slideType: 'cover' },
      { slideNumber: 2, slideType: 'content', locationName: 'ジンバラン・シーフード', phraseEn: 'Can I choose my own fish?', phraseJp: '自分で魚を選べますか？', usageTip: '水槽やディスプレイから選ぶスタイル' },
      { slideNumber: 3, slideType: 'content', locationName: 'ジンバラン・シーフード', phraseEn: 'How is this cooked? Grilled or fried?', phraseJp: 'これはどう調理しますか？焼きか揚げか？', usageTip: '調理法を選べる店が多い' },
      { slideNumber: 4, slideType: 'content', locationName: 'ジンバラン・シーフード', phraseEn: 'Is this price per kilo or per piece?', phraseJp: 'この値段はキロ単価ですか？1匹の値段ですか？', usageTip: '量り売りか個数売りか事前確認を' },
      { slideNumber: 5, slideType: 'content', locationName: 'ジンバラン・シーフード', phraseEn: 'Can we have a table on the beach?', phraseJp: 'ビーチ側のテーブルをお願いできますか？', usageTip: 'サンセットを見ながら食事が最高' },
      { slideNumber: 6, slideType: 'content', locationName: 'ジンバラン・シーフード', phraseEn: "We'd like the seafood platter for two.", phraseJp: '2人用シーフードプラッターをお願いします', usageTip: 'シェアプラッターがコスパ良くておすすめ' },
      { slideNumber: 7, slideType: 'cta', leadMagnet: 'レベル別英語学習ロードマップ' },
    ],
  },
];

// ============================================================
// 全コンテンツを結合してエクスポート
// ============================================================

export const allContent: ContentItem[] = [
  ...listItems,
  ...quizItems,
  ...beforeAfterItems,
  ...situationItems,
  ...storyItems,
  ...studentMistakeItems,
  ...baliReportItems,
];

export const getContentByType = (type: ContentType): ContentItem[] =>
  allContent.filter((item) => item.type === type);

export const getContentById = (id: number): ContentItem | undefined =>
  allContent.find((item) => item.id === id);
