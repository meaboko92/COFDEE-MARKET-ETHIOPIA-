export default function PaymentAvailability() {
  const methods = [
    { name: 'Chapa checkout', detail: 'Planned online checkout for supported Ethiopian payment methods.', status: 'Activation required' },
    { name: 'Visa / credit & debit cards', detail: 'Card payments can be offered through Chapa after merchant approval and live credentials are configured.', status: 'Not active yet' },
    { name: 'Bank transfer', detail: 'Bank transfer instructions will be shown only after MEA BOKO adds and verifies its business account details.', status: 'Admin setup required' },
    { name: 'PayPal', detail: 'PayPal receiving is not currently confirmed for an Ethiopia-registered merchant.', status: 'Unavailable for now' },
  ];

  return (
    <section className="account-section payment-methods-section" id="payment-options">
      <div className="account-intro">
        <p className="eyebrow">SAFE & TRANSPARENT CHECKOUT</p>
        <h2>Payment options<br />for coffee trade.</h2>
        <p>MEA BOKO is preparing local and international payment options. We will show a method as available only after the business account and payment connection are verified.</p>
      </div>
      <div className="account-card">
        <div className="account-subsection">
          <h3>Payment availability</h3>
          <div className="payment-availability-list">
            {methods.map((method) => (
              <article className="admin-record" key={method.name}>
                <div className="admin-record-main">
                  <div><h4>{method.name}</h4><span className="listing-status status-pending">{method.status}</span></div>
                  <p>{method.detail}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="account-hint">Please do not send money until MEA BOKO provides an official invoice and verified business payment instructions. Never share a card PIN, password or one-time code.</p>
          <p className="account-hint">Chapa documentation: <a href="https://developer.chapa.co/" target="_blank" rel="noreferrer">official developer guide</a>.</p>
        </div>
      </div>
    </section>
  );
}
