// Browser fixtures never load the provider or make a payment. The real checkout
// must still pass the server-confirmed amount to this SDK-shaped boundary.
export async function loadTossPayments() {
  return { payment: () => ({ requestPayment: async (request: unknown) => {
    await fetch('/fixture/toss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  } }) };
}
