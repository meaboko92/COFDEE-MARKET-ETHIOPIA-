import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const emptyForm = {
  provider_code: '',
  display_name: '',
  method_type: 'bank_transfer',
  currency: 'ETB',
  account_name: '',
  account_reference: '',
  instructions: '',
};

export default function PaymentMethodsPanel() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [methods, setMethods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadMethods = useCallback(async (sessionUser) => {
    if (!supabase) return;
    let currentUser = sessionUser;
    if (typeof sessionUser === 'undefined') {
      const { data: authData } = await supabase.auth.getUser();
      currentUser = authData?.user || null;
    }
    setUser(currentUser);
    let admin = false;
    if (currentUser) {
      const { data: profile } = await supabase.from('profiles')
        .select('role').eq('id', currentUser.id).maybeSingle();
      admin = profile?.role === 'admin';
    }
    setIsAdmin(admin);
    let query = supabase.from('payment_methods')
      .select('id,provider_code,display_name,method_type,currency,account_name,account_reference,instructions,is_active,sort_order,created_at')
      .order('sort_order').order('display_name');
    if (!admin) query = query.eq('is_active', true);
    const { data, error: loadError } = await query;
    if (loadError) setError(loadError.message);
    else setMethods(data || []);
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    loadMethods();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      loadMethods(session?.user || null);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadMethods]);

  async function registerMethod(event) {
    event.preventDefault();
    if (!isAdmin || !user || !supabase) return;
    const providerCode = form.provider_code.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (!providerCode || !form.display_name.trim() || form.instructions.trim().length < 5) {
      setError('Enter a method code, display name and clear payment instructions.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    const { error: insertError } = await supabase.from('payment_methods').insert({
      provider_code: providerCode,
      display_name: form.display_name.trim(),
      method_type: form.method_type,
      currency: form.currency,
      account_name: form.account_name.trim() || null,
      account_reference: form.account_reference.trim() || null,
      instructions: form.instructions.trim(),
      is_active: false,
      created_by: user.id,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.code === '23505' ? 'That method code already exists. Choose a different code.' : insertError.message);
      return;
    }
    setForm(emptyForm);
    setMessage('Payment method registered as inactive. Review its public details, then activate it when ready.');
    await loadMethods();
    window.dispatchEvent(new CustomEvent('mea-boko-payment-methods-updated'));
  }

  async function setMethodActive(method, isActive) {
    if (!isAdmin || !supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    const { error: updateError } = await supabase.from('payment_methods')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', method.id);
    setBusy(false);
    if (updateError) setError(updateError.message);
    else {
      setMessage(isActive ? 'Payment method is now visible to marketplace users.' : 'Payment method has been paused.');
      await loadMethods();
      window.dispatchEvent(new CustomEvent('mea-boko-payment-methods-updated'));
    }
  }

  async function removeMethod(method) {
    if (!isAdmin || !supabase || !window.confirm('Delete this payment method?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    const { error: deleteError } = await supabase.from('payment_methods').delete().eq('id', method.id);
    setBusy(false);
    if (deleteError) setError(deleteError.message);
    else {
      setMessage('Payment method deleted.');
      await loadMethods();
      window.dispatchEvent(new CustomEvent('mea-boko-payment-methods-updated'));
    }
  }

  if (!isSupabaseConfigured) return null;

  return <section className="account-section payment-methods-section" id="payment-methods">
    <div className="account-intro">
      <p className="eyebrow">MEA BOKO PAYMENT OPTIONS</p>
      <h2>Clear payment<br />instructions.</h2>
      <p>View the payment methods configured by MEA BOKO. Payment records submitted in an order remain subject to review.</p>
    </div>
    <div className="account-card">
      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {message && <div className="notice account-message" role="status">{message}</div>}
      <div className="account-subsection">
        <h3>Available payment methods</h3>
        {methods.filter((method) => method.is_active).length ? methods.filter((method) => method.is_active).map((method) =>
          <article className="admin-record" key={method.id}>
            <div className="admin-record-main">
              <div><h4>{method.display_name}</h4><span className="listing-status status-approved">{method.currency} · {method.method_type.replaceAll('_',' ')}</span></div>
              {method.account_name && <p>Account name: {method.account_name}</p>}
              {method.account_reference && <p>Business payment reference: {method.account_reference}</p>}
              <p>{method.instructions}</p>
            </div>
          </article>
        ) : <p className="account-hint">No payment method has been activated yet. Contact MEA BOKO before sending money; do not transfer funds to unverified personal accounts.</p>}
      </div>
      {isAdmin && <>
        <div className="account-subsection">
          <h3>Register a MEA BOKO payment method</h3>
          <p className="account-hint">Only add payment destinations owned or authorized by the MEA BOKO business. Details become publicly visible when activated. Never enter a PIN, password, card number, private API key or banking login.</p>
          <form className="account-form" onSubmit={registerMethod}>
            <div className="form-row">
              <label>Method name<input value={form.display_name} onChange={(event) => setForm((old) => ({ ...old, display_name: event.target.value }))} required maxLength="100" placeholder="e.g. MEA BOKO Business Bank Transfer" /></label>
              <label>Method code<input value={form.provider_code} onChange={(event) => setForm((old) => ({ ...old, provider_code: event.target.value }))} required maxLength="40" placeholder="e.g. meaboko_bank" /></label>
            </div>
            <div className="form-row">
              <label>Method type<select value={form.method_type} onChange={(event) => setForm((old) => ({ ...old, method_type: event.target.value }))}><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="cash">Cash</option><option value="payment_gateway">Payment gateway</option><option value="other">Other</option></select></label>
              <label>Currency<select value={form.currency} onChange={(event) => setForm((old) => ({ ...old, currency: event.target.value }))}><option value="ETB">ETB</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
            </div>
            <label>Business account name<input value={form.account_name} onChange={(event) => setForm((old) => ({ ...old, account_name: event.target.value }))} maxLength="120" placeholder="Registered MEA BOKO business account name" /></label>
            <label>Business payment reference<input value={form.account_reference} onChange={(event) => setForm((old) => ({ ...old, account_reference: event.target.value }))} maxLength="180" placeholder="Business account / merchant reference shown to payers" /></label>
            <label>Payment instructions<textarea value={form.instructions} onChange={(event) => setForm((old) => ({ ...old, instructions: event.target.value }))} required rows="3" maxLength="2000" placeholder="Explain how the buyer can pay and what reference to include." /></label>
            <button className="button button-dark" disabled={busy}>{busy ? 'Saving…' : 'Register payment method'}</button>
          </form>
        </div>
        <div className="account-subsection">
          <h3>Manage registered methods</h3>
          {methods.length ? methods.map((method) => <article className="admin-record" key={method.id}>
            <div className="admin-record-main">
              <div><h4>{method.display_name}</h4><span className={'listing-status '+(method.is_active ? 'status-approved' : 'status-pending')}>{method.is_active ? 'Active' : 'Inactive'}</span></div>
              <p>{method.provider_code} · {method.currency} · {method.method_type.replaceAll('_',' ')}</p>
              <p>{method.account_name || 'No account name'} · {method.account_reference || 'No payment reference'}</p>
              <p>{method.instructions}</p>
            </div>
            <div className="admin-actions">
              <button type="button" className="button button-gold" disabled={busy} onClick={() => setMethodActive(method,!method.is_active)}>{method.is_active ? 'Pause method' : 'Activate method'}</button>
              <button type="button" className="admin-danger" disabled={busy} onClick={() => removeMethod(method)}>Delete</button>
            </div>
          </article>) : <p className="account-hint">No payment methods registered.</p>}
        </div>
      </>}
    </div>
  </section>;
}
