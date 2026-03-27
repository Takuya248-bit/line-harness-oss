// Satoriが受け取るノードの型定義
export interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriNode | SatoriNode[] | string | (SatoriNode | string)[];
    [key: string]: unknown;
  };
}
