/** DOM を組み立てる最小の補助。UI の各モジュールが共通で使う。 */

type Child = Node | string | number | false | null | undefined;

export interface ElProps {
  class?: string;
  text?: string;
  html?: never; // innerHTML は使わない（XSS と保守性のため）
  attrs?: Record<string, string | number | boolean | undefined>;
  on?: { [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void };
  dataset?: Record<string, string>;
}

/** 例: el('button', { class: 'btn', text: '送信', on: { click: submit } }) */
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === undefined || v === false) continue;
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (props.dataset) Object.assign(node.dataset, props.dataset);
  if (props.on) {
    for (const [type, handler] of Object.entries(props.on)) {
      node.addEventListener(type, handler as EventListener);
    }
  }
  append(node, children);
  return node;
};

export const append = (parent: Node, children: readonly Child[]): void => {
  for (const c of children) {
    if (c === false || c === null || c === undefined) continue;
    parent.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
};

/** 子要素をすべて取り除く。 */
export const clear = (node: Node): void => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

/** スクリーンリーダー向けに状況を読み上げる（index.html の #sr-status）。 */
export const announce = (text: string): void => {
  const live = document.getElementById('sr-status');
  if (!live) return;
  live.textContent = '';
  // 同じ文言でも再読み上げされるよう、一度空にしてから次のフレームで入れる
  requestAnimationFrame(() => {
    live.textContent = text;
  });
};
