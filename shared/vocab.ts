// Controlled vocabulary (PRD §7.1) — shared by the vision model, the query parser, and the templates grid.

export const CATEGORIES = [
  'saree', 'lehenga', 'kurta_set', 'salwar_suit', 'gown', 'dress', 'sherwani', 'suit', 'blazer', 'shirt',
  'skirt', 'ethnic_jacket',
  // Phase 8: western/streetwear pieces and bottoms, so outfits can be put together.
  'top', 'hoodie', 'jacket', 'jeans', 'trousers', 'shorts', 'co_ord_set',
  'other',
] as const

export const OCCASIONS = [
  'wedding', 'reception', 'sangeet_mehendi', 'festival', 'party', 'interview', 'formal_event', 'photoshoot',
  'college_event', 'casual_outing',
  // Phase 8: nightlife and music.
  'club_night', 'concert',
] as const

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'] as const

export const GENDERS = ['women', 'men', 'unisex'] as const

export type Category = typeof CATEGORIES[number]
export type Occasion = typeof OCCASIONS[number]
export type Size = typeof SIZES[number]
export type Gender = typeof GENDERS[number]

export const OCCASION_LABELS: Record<Occasion, string> = {
  wedding: 'Wedding',
  reception: 'Reception',
  sangeet_mehendi: 'Sangeet / Mehendi',
  festival: 'Festival',
  party: 'Party',
  interview: 'Interview',
  formal_event: 'Formal event',
  photoshoot: 'Photoshoot',
  college_event: 'College event',
  casual_outing: 'Casual outing',
  club_night: 'Club / rave',
  concert: 'Concert / gig',
}

export const CATEGORY_LABELS: Record<Category, string> = {
  saree: 'Saree',
  lehenga: 'Lehenga',
  kurta_set: 'Kurta set',
  salwar_suit: 'Salwar suit',
  gown: 'Gown',
  dress: 'Dress',
  sherwani: 'Sherwani',
  suit: 'Suit',
  blazer: 'Blazer',
  shirt: 'Shirt',
  skirt: 'Skirt',
  ethnic_jacket: 'Ethnic jacket',
  top: 'Top',
  hoodie: 'Hoodie',
  jacket: 'Jacket',
  jeans: 'Jeans',
  trousers: 'Trousers',
  shorts: 'Shorts',
  co_ord_set: 'Co-ord set',
  other: 'Other',
}

// Where a piece sits in an outfit — drives "Complete the look". One-piece outfits pair with layers; tops with bottoms.
export type Slot = 'top' | 'bottom' | 'one_piece' | 'layer' | 'other'
export const CATEGORY_SLOT: Record<Category, Slot> = {
  saree: 'one_piece', lehenga: 'one_piece', kurta_set: 'one_piece', salwar_suit: 'one_piece', gown: 'one_piece',
  dress: 'one_piece', sherwani: 'one_piece', suit: 'one_piece', co_ord_set: 'one_piece',
  shirt: 'top', top: 'top', hoodie: 'top',
  skirt: 'bottom', jeans: 'bottom', trousers: 'bottom', shorts: 'bottom',
  blazer: 'layer', jacket: 'layer', ethnic_jacket: 'layer',
  other: 'other',
}
// In priority order: the first slot is what "completes" the piece (a bottom for a top); later ones are extras.
export const PAIRS_WITH: Record<Slot, Slot[]> = {
  top: ['bottom', 'layer'],
  bottom: ['top', 'layer'],
  one_piece: ['layer'],
  layer: ['top', 'bottom', 'one_piece'],
  other: [],
}
// One-pieces that already include their own layer never get another one suggested.
const HAS_OWN_LAYER: Category[] = ['suit', 'sherwani']
export const categoriesInSlot = (slot: Slot, anchorSlot: Slot) =>
  CATEGORIES.filter((c) => CATEGORY_SLOT[c] === slot && !(anchorSlot === 'layer' && HAS_OWN_LAYER.includes(c)))

export const EMBEDDING_DIMENSIONS = 768
export const DEFAULT_RADIUS_KM = 10
