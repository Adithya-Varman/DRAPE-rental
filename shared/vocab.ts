// Controlled vocabulary (PRD §7.1) — shared by the vision model, the query parser, and the templates grid.

export const CATEGORIES = [
  'saree', 'lehenga', 'kurta_set', 'salwar_suit', 'gown', 'dress', 'sherwani', 'suit', 'blazer', 'shirt',
  'skirt', 'ethnic_jacket', 'other',
] as const

export const OCCASIONS = [
  'wedding', 'reception', 'sangeet_mehendi', 'festival', 'party', 'interview', 'formal_event', 'photoshoot',
  'college_event', 'casual_outing',
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
  other: 'Other',
}

export const EMBEDDING_DIMENSIONS = 768
export const DEFAULT_RADIUS_KM = 10
