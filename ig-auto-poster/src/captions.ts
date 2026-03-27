const HASHTAGS = [
  "#英語学習",
  "#英会話",
  "#英語フレーズ",
  "#バリ島",
  "#バリ島留学",
  "#英語勉強法",
  "#ネイティブ英語",
  "#留学",
  "#海外生活",
  "#バリリンガル",
].join(" ");

const CAPTION_TEMPLATES = [
  `{{TITLE}}

保存して何度も見返してね！
好きな英単語をコメントで教えてね 💬
毎日使える英語を発信中 ✈️🌴

{{HASHTAGS}}`,

  `{{TITLE}}

これ全部言えたらすごい！
バリ島で実際に使ってる表現です 🏄‍♂️
あなたの好きな英単語、コメントで教えて！

{{HASHTAGS}}`,

  `{{TITLE}}

スワイプして全部チェック →
好きな英単語をコメントで教えてね 💬

{{HASHTAGS}}`,

  `{{TITLE}}

知ってるだけで会話がスムーズに！
好きな英単語をコメント欄に書いてね ✍️

{{HASHTAGS}}`,

  `{{TITLE}}

バリ島から毎日英語Tips配信中 🌊
好きな英単語をコメントで教えてね 💬
保存&フォローで見逃さない！

{{HASHTAGS}}`,
];

/**
 * Get caption for a given rotation index.
 */
export function getCaption(title: string, rotationIndex: number): string {
  const template = CAPTION_TEMPLATES[rotationIndex % CAPTION_TEMPLATES.length];
  return template
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{HASHTAGS}}", HASHTAGS);
}
