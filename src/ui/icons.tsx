import type { JSX } from 'preact';

const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;

const make = (d: JSX.Element) => () => <svg {...base}>{d}</svg>;

export const Pencil = make(<path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" />);
export const Eraser = make(<path d="M7 21h12M5 15l9-9a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-8 8H8l-3-3a1 1 0 0 1 0-1z" />);
export const Fill = make(<path d="M5 11l7-7 7 7-7 7-7-7zM3 21h4M19 14c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4z" />);
export const Dropper = make(<path d="M14 6l4 4M17 3l4 4-3 3-4-4 3-3zM13 7L4 16v4h4l9-9" />);
export const Move = make(<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />);
export const Hand = make(<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m0-3a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 14" />);
export const Undo = make(<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />);
export const Redo = make(<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />);
export const ZoomIn = make(<path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6M11 8v6" />);
export const ZoomOut = make(<path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6" />);
export const Fit = make(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const Eye = make(<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />);
export const EyeOff = make(<path d="M3 3l18 18M10 6a9 9 0 0 1 2-.2c6 0 10 7 10 7a17 17 0 0 1-3 3.6M6 7.5C3.5 9.3 2 12 2 12s4 7 10 7a9 9 0 0 0 4-1M9.9 10A3 3 0 0 0 14 14" />);
export const Menu = make(<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="4" />);
export const Plus = make(<path d="M12 5v14M5 12h14" />);
export const Layers = make(<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />);
export const Back = make(<path d="M15 5l-7 7 7 7" />);
export const Up = make(<path d="M12 19V5M5 12l7-7 7 7" />);
export const Down = make(<path d="M12 5v14M5 12l7 7 7-7" />);
export const Left = make(<path d="M19 12H5M12 5l-7 7 7 7" />);
export const Right = make(<path d="M5 12h14M12 5l7 7-7 7" />);
export const Edit = make(<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />);
export const Expand = make(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9L4 4M15 9l5-5M9 15l-5 5M15 15l5 5" />);
