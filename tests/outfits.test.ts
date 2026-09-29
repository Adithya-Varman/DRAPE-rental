import { describe, expect, it } from 'vitest'
import { CATEGORIES, CATEGORY_SLOT, PAIRS_WITH, categoriesInSlot } from '../shared/vocab.js'

describe('outfit slots', () => {
  it('assigns every category a slot', () => {
    for (const c of CATEGORIES) expect(CATEGORY_SLOT[c]).toBeDefined()
  })
  it('completes tops with bottoms first and bottoms with tops first', () => {
    expect(PAIRS_WITH.top[0]).toBe('bottom')
    expect(PAIRS_WITH.bottom[0]).toBe('top')
    expect(PAIRS_WITH.one_piece).toEqual(['layer'])
  })
  it('lists the new bottoms and streetwear categories in the right slots', () => {
    expect(categoriesInSlot('bottom', 'top')).toEqual(expect.arrayContaining(['jeans', 'trousers', 'shorts', 'skirt']))
    expect(categoriesInSlot('top', 'bottom')).toEqual(expect.arrayContaining(['top', 'hoodie', 'shirt']))
    expect(categoriesInSlot('layer', 'top')).toEqual(expect.arrayContaining(['jacket', 'blazer']))
  })
  it('never suggests a layer on top of a suit or sherwani', () => {
    expect(categoriesInSlot('one_piece', 'layer')).not.toContain('suit')
    expect(categoriesInSlot('one_piece', 'layer')).not.toContain('sherwani')
    expect(categoriesInSlot('one_piece', 'layer')).toContain('dress')
  })
})
