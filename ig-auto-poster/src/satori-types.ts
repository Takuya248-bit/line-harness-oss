// Satoriノード型定義（テンプレート互換用スタブ）
// Satori本体は除去済み。テンプレートの型チェック用に残存。
export interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriNode | SatoriNode[] | string | (SatoriNode | string)[];
    [key: string]: unknown;
  };
}
