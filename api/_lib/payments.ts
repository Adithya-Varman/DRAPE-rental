// Advance payments. MOCK: always succeeds and moves no money (chosen for the hackathon demo; the UI labels it as a
// demo payment). To go live, replace chargeAdvance() with a real provider (e.g. Razorpay order + signature check)
// — nothing else in the booking flow needs to change.
import { randomBytes } from 'node:crypto'

export type PaymentMethod = 'upi' | 'card'

export async function chargeAdvance(input: { amount: number; method: PaymentMethod }): Promise<{ ref: string }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Invalid advance amount')
  return { ref: `MOCK-${input.method.toUpperCase()}-${randomBytes(6).toString('hex').toUpperCase()}` }
}

// MOCK refund to match chargeAdvance(): with a real provider this would call its refund API for paymentRef.
export async function refundAdvance(input: { amount: number; paymentRef: string }): Promise<{ ref: string }> {
  return { ref: `MOCK-REFUND-${input.paymentRef}` }
}
