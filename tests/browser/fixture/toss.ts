// Browser fixtures never load the provider or make a payment. The real checkout
// must still pass the server-confirmed amount to this SDK-shaped boundary.
export async function loadTossPayments() {
  return { widgets: () => ({
    setAmount: async (amount: unknown) => { await fetch('/fixture/toss-amount', { method: 'POST', body: JSON.stringify(amount) }); },
    renderPaymentMethods: async ({ selector }: {selector: string}) => { document.querySelector(selector)!.textContent = '테스트 결제수단'; return { destroy: async () => {} }; },
    renderAgreement: async ({ selector }: {selector: string}) => { document.querySelector(selector)!.textContent = '테스트 결제 약관'; return { destroy: async () => {} }; },
    requestPayment: async (request: unknown) => { await fetch('/fixture/toss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }); },
  }), payment: () => ({ requestPayment: async (request: unknown) => {
    await fetch('/fixture/toss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  } }) };
}
