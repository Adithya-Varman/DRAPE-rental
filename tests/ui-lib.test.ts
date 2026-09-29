import { describe, expect, it } from 'vitest'
import { formatKm, kmBetween, occasionLabel, rupees } from '../src/lib.js'

describe('browser helpers', () => {
  it('computes area-to-area distance close to the PostGIS value', () => {
    // Adyar → Tambaram: PostGIS geography returned 19.0 km in the RPC tests.
    expect(kmBetween({ lat: 13.0012, lng: 80.2565 }, { lat: 12.9249, lng: 80.1 })).toBeCloseTo(19.0, 0)
  })
  it('formats distances for the card chip', () => {
    expect(formatKm(0)).toBe('Nearby')
    expect(formatKm(3.94)).toBe('3.9 km')
    expect(formatKm(19.02)).toBe('19 km')
    expect(formatKm(null)).toBeNull()
  })
  it('formats rupees Indian-style and labels occasions', () => {
    expect(rupees(1200)).toBe('₹1,200')
    expect(rupees(125000)).toBe('₹1,25,000')
    expect(occasionLabel('sangeet_mehendi')).toBe('Sangeet / Mehendi')
  })
})
