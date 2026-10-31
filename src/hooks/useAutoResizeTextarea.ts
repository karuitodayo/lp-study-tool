import { useCallback, useEffect, useRef } from "react";

// テキストエリアの高さを内容に合わせて自動で伸ばす（内部スクロールバーを減らすための共通処理）。
// value（表示中の文字列）が変わるたびに高さを再計算するので、外部から値をセットし直した場合にも追従する。
export function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // box-sizing: border-box のため、scrollHeight（内容＋padding分）だけを高さに設定すると
    // 枠線の分だけ足りず常にわずかな内部スクロールが残ってしまう。枠線の太さを加えて解消する。
    const style = window.getComputedStyle(el);
    const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + borderHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return { ref, onInput: resize };
}
