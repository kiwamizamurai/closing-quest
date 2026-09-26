/** カードパネルで使う小さな SVG アイコン（色は currentColor。装飾なので読み上げ対象外）。 */

const NS = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'check'
  | 'cross'
  | 'warn'
  | 'star'
  | 'starEmpty'
  | 'bulb'
  | 'plus'
  | 'book'
  | 'arrowUp'
  | 'arrowDown'
  | 'info'
  | 'link'
  | 'minusCircle';

interface Shape {
  readonly d: string;
  readonly fill?: boolean;
}

const SHAPES: Record<IconName, readonly Shape[]> = {
  check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
  cross: [{ d: 'M6 6l12 12M18 6L6 18' }],
  warn: [{ d: 'M12 4l9 16H3z' }, { d: 'M12 10v4.5M12 17.4v.2' }],
  star: [{ d: 'M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.7l6-.8z', fill: true }],
  starEmpty: [{ d: 'M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.7l6-.8z' }],
  bulb: [
    { d: 'M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z' },
    { d: 'M9.5 19h5M10.5 21.4h3' },
  ],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  book: [{ d: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h9' }],
  arrowUp: [{ d: 'M12 19V5M6 11l6-6 6 6' }],
  arrowDown: [{ d: 'M12 5v14M6 13l6 6 6-6' }],
  info: [{ d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' }, { d: 'M12 11v5.5M12 7.6v.2' }],
  link: [{ d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }],
  minusCircle: [{ d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' }, { d: 'M8 12h8' }],
};

export const icon = (name: IconName, size = 18): SVGSVGElement => {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'cq-icon');
  for (const shape of SHAPES[name]) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', shape.d);
    if (shape.fill) {
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.4');
    } else {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2.4');
    }
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }
  return svg;
};
