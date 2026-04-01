export interface CaptionInput {
  category: string;
  templateName: string;
  title: string;
  hook: string;
  bodyLines: string[];
  area?: string;
}

const LINE_CTA = `---
留学の費用が気になったら
プロフィールのLINEから無料で費用表を受け取れます`;

/** カテゴリ別フック（冒頭1行）。空の hook 指定時はここからランダム */
const CATEGORY_HOOKS: Record<string, string[]> = {
  cafe: [
    "バリ島のカフェ、実はコーヒー1杯150円って知ってた？",
    "観光地価格じゃない？バリのカフェラテ、相場はいくらだと思う？",
    "リモートワークしながらバリ暮らし、カフェ代だけで月いくらになる？",
    "バリの映えカフェ、朝イチで行くと意外と空いてるって知ってる？",
  ],
  cost: [
    "バリ島留学、1ヶ月の生活費いくらだと思う？",
    "日本と比べて物価半額って本当？バリの日用品レベル教える",
    "語学学校+家賃+食費、バリ1ヶ月の最低ラインを知りたくない？",
    "ルピア換算で損しないコツ、知らないと毎回バカにされるよ",
  ],
  lifestyle: [
    "30代で海外留学、遅い？バリなら全然アリな理由",
    "バリ移住1年目で最初に後悔しがちなこと、聞く？",
    "ノマドワーカーがバリに集まるの、ただのサボりじゃないんだよね",
    "家族連れでバリ長期滞在、現実的に破綻しないラインってある？",
  ],
  spot: [
    "バリの定番スポット、実は混む時間帯をずらすだけで別世界？",
    "観光バスじゃ届かない絶景、地元民ワゴンで行ける場所あるよ",
    "インスタで見たあの棚田、ウブドからどれくらいかかると思う？",
  ],
  food: [
    "バリのナシチャン、店によって味が全然違うって知ってた？",
    "ローカルワルンとリゾート飯、同じ1日で両方楽しむコツ",
    "激辛サンバル耐性ゼロでも大丈夫？バリグルメの守り方",
  ],
  beach: [
    "バリのビーチ、浜ごとに波の難易度が違うの知ってる？",
    "サンセット前にサクッと移動、どのビーチが本命か当てられる？",
    "ヒラヒラ割るボード初心者、最初に行くべき浜どれだと思う？",
  ],
  visa: [
    "2026年版、バリ長期滞在で最初に詰まりやすいビザの話聞く？",
    "観光ビザ延長、何回ループまでが現実ラインだと思う？",
    "入国審査で聞かれる定番、準備しておくとスムーズなやつ",
  ],
  culture: [
    "バリヒンズー教のお供え、踏んじゃダメな理由サクッと説明するね",
    "サロン必須の寺院、パンツ一丁で入れると思ってない？",
    "ガルンガンって何の日？祝日カレンダーだけじゃ分かんないやつ",
    "ケチャダンス前に知っておくと恥ずかしくないマナーあるよ",
  ],
};

const COMMON_HASHTAGS =
  "#バリ島 #バリ旅行 #バリ島留学 #バリリンガル #海外旅行 #インドネシア #バリ島情報 #バリ島おすすめ";

const CATEGORY_HASHTAGS: Record<string, string> = {
  cafe: "#バリ島カフェ",
  spot: "#バリ島観光",
  food: "#バリ島グルメ",
  beach: "#バリ島ビーチ",
  lifestyle: "#バリ島移住",
  cost: "#バリ島物価",
  visa: "#バリ島ビザ",
  culture: "#バリ島文化",
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function resolveHook(category: string, hook: string): string {
  const trimmed = hook.trim();
  if (trimmed.length > 0) return trimmed;
  const pool = CATEGORY_HOOKS[category] ?? CATEGORY_HOOKS.spot;
  return pickRandom(pool.length > 0 ? pool : ["バリ島、表面的な情報だけで終わらせない？"]);
}

function buildHashtagLine(category: string, area?: string): string {
  const catTag = CATEGORY_HASHTAGS[category] ?? "#バリ島";
  const areaPart = area?.trim()
    ? `#${area.replace(/ー/g, "")}`
    : "";
  return [COMMON_HASHTAGS, catTag, areaPart].filter(Boolean).join(" ");
}

export function generateCaption(input: CaptionInput): string {
  const hookLine = resolveHook(input.category, input.hook);
  const body = input.bodyLines.map((l) => l.trim()).filter(Boolean).join("\n");
  const hashtags = buildHashtagLine(input.category, input.area);
  const titleBlock = input.title.trim();

  return [hookLine, "", titleBlock, "", body, "", LINE_CTA, "", hashtags].join("\n");
}
