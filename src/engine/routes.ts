/** [Malayalam, English] */
export type Stop = readonly [string, string];

export const ROUTES = {
  north: {
    name: 'Kannur → Kozhikode',
    stops: [['കണ്ണൂർ', 'Kannur'], ['തലശ്ശേരി', 'Thalassery'], ['മാഹി', 'Mahe'], ['വടകര', 'Vadakara'], ['കൊയിലാണ്ടി', 'Koyilandy'], ['കോഴിക്കോട്', 'Kozhikode']],
  },
  central: {
    name: 'Thrissur → Ernakulam',
    stops: [['തൃശ്ശൂർ', 'Thrissur'], ['ചാലക്കുടി', 'Chalakudy'], ['അങ്കമാലി', 'Angamaly'], ['ആലുവ', 'Aluva'], ['എറണാകുളം', 'Ernakulam']],
  },
  south: {
    name: 'Thiruvananthapuram → Kollam',
    stops: [['തിരുവനന്തപുരം', 'Thiruvananthapuram'], ['കഴക്കൂട്ടം', 'Kazhakkoottam'], ['ആറ്റിങ്ങൽ', 'Attingal'], ['കല്ലമ്പലം', 'Kallambalam'], ['ചാത്തന്നൂർ', 'Chathannoor'], ['കൊല്ലം', 'Kollam']],
  },
} as const satisfies Record<string, { name: string; stops: readonly Stop[] }>;

export type RouteKey = keyof typeof ROUTES;
export const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];
