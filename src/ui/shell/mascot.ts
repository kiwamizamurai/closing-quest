import { el } from '@/ui/dom';

export const createMascot = (className: string): HTMLImageElement =>
  el('img', {
    class: className,
    attrs: {
      src: `${import.meta.env.BASE_URL}assets/art/mascot.png`,
      alt: '',
      'aria-hidden': 'true',
      width: 512,
      height: 512,
      decoding: 'async',
      draggable: 'false',
    },
    on: { error: (ev) => (ev.currentTarget as HTMLElement | null)?.remove() },
  });
