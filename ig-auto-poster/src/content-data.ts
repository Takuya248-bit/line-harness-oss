export interface Phrase {
  en: string;
  jp: string;
  exampleEn: string;
  exampleJp: string;
}

export interface ContentItem {
  title: string;
  subtitle: string;
  leadMagnet: string;
  phrases: Phrase[];
}

/**
 * Content pool for carousel posts.
 * Add more items to expand the rotation.
 */
export const CONTENT_POOL: ContentItem[] = [
  {
    title: "ネイティブが毎日使う\n英語フレーズ5選",
    subtitle: "知らないと損する表現集",
    leadMagnet: "無料フレーズ集50をプレゼント",
    phrases: [
      {
        en: "That makes sense",
        jp: "なるほどね",
        exampleEn: "A: I took a shortcut. B: That makes sense!",
        exampleJp: "A: 近道したんだ B: なるほどね！",
      },
      {
        en: "I'm good",
        jp: "大丈夫です / 結構です",
        exampleEn: "A: Want some more? B: I'm good, thanks!",
        exampleJp: "A: もっといる？ B: 大丈夫、ありがとう！",
      },
      {
        en: "No worries",
        jp: "気にしないで",
        exampleEn: "A: Sorry I'm late! B: No worries!",
        exampleJp: "A: 遅れてごめん！ B: 気にしないで！",
      },
      {
        en: "Let me know",
        jp: "教えてね",
        exampleEn: "Let me know if you need anything.",
        exampleJp: "何か必要なら教えてね。",
      },
      {
        en: "It depends",
        jp: "場合による",
        exampleEn: "A: Is Bali expensive? B: It depends on your lifestyle.",
        exampleJp: "A: バリって高い？ B: ライフスタイルによるね。",
      },
    ],
  },
  {
    title: "カフェで使える\n英語フレーズ5選",
    subtitle: "バリのカフェで実際に使える！",
    leadMagnet: "旅行英会話フレーズ30をプレゼント",
    phrases: [
      {
        en: "Can I get an iced latte?",
        jp: "アイスラテください",
        exampleEn: "Can I get an iced latte with oat milk?",
        exampleJp: "オーツミルクのアイスラテください。",
      },
      {
        en: "For here, please",
        jp: "店内でお願いします",
        exampleEn: "A: For here or to go? B: For here, please.",
        exampleJp: "A: 店内ですか？ B: 店内で。",
      },
      {
        en: "Could I have the Wi-Fi password?",
        jp: "Wi-Fiのパスワード教えてもらえますか？",
        exampleEn: "Excuse me, could I have the Wi-Fi password?",
        exampleJp: "すみません、Wi-Fiのパスワード教えてもらえますか？",
      },
      {
        en: "I'll have the same",
        jp: "同じものをください",
        exampleEn: "That looks great. I'll have the same.",
        exampleJp: "美味しそう。同じのください。",
      },
      {
        en: "Check, please",
        jp: "お会計お願いします",
        exampleEn: "Excuse me, check please!",
        exampleJp: "すみません、お会計お願いします！",
      },
    ],
  },
  {
    title: "日本人が間違えやすい\n英語表現5選",
    subtitle: "ネイティブはこう言う！",
    leadMagnet: "間違えやすい英語100選をプレゼント",
    phrases: [
      {
        en: "My English isn't great",
        jp: "英語あまり得意じゃなくて",
        exampleEn: "Sorry, my English isn't great yet.",
        exampleJp: "ごめん、まだ英語あんまり得意じゃなくて。",
      },
      {
        en: "I'm into surfing",
        jp: "サーフィンにハマってる",
        exampleEn: "I'm really into surfing lately.",
        exampleJp: "最近サーフィンにめっちゃハマってる。",
      },
      {
        en: "I'll think about it",
        jp: "ちょっと考えます",
        exampleEn: "Sounds interesting. I'll think about it.",
        exampleJp: "面白そう。ちょっと考えるね。",
      },
      {
        en: "It's up to you",
        jp: "あなた次第だよ",
        exampleEn: "A: Where should we eat? B: It's up to you!",
        exampleJp: "A: どこ食べる？ B: 任せるよ！",
      },
      {
        en: "That's not what I meant",
        jp: "そういう意味じゃなくて",
        exampleEn: "Oh, that's not what I meant. Let me explain.",
        exampleJp: "あ、そういう意味じゃなくて。説明するね。",
      },
    ],
  },
];
