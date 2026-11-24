/**
 * Telebirr SuperApp bridge helpers.
 *
 * The Mini App host injects window.ma. Never construct rawRequest in the
 * browser: it must come from the authenticated MEA BOKO server function.
 */
export function isTelebirrMiniApp() {
  return typeof window !== 'undefined' &&
    Boolean(window.ma && typeof window.ma.native === 'function');
}

export function startTelebirrPayment(rawRequest) {
  if (!isTelebirrMiniApp()) {
    return Promise.reject(new Error('Open MEA BOKO inside the approved Telebirr Mini App.'));
  }
  if (typeof rawRequest !== 'string' || !rawRequest.trim()) {
    return Promise.reject(new Error('The secure payment request is missing.'));
  }
  return window.ma.native('startPay', {
    rawRequest: rawRequest.trim(),
    bussinessType: 'BuyGoods',
  }).then((result) => {
    if (String(result?.resultCode) !== '1') {
      throw new Error('Telebirr did not confirm a successful payment. Check the transaction status before retrying.');
    }
    return result;
  });
}
