import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';

export default function AccountPanel() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const [listings, setListings] = useState([]);
  const [origins, setOrigins] = useState([]);

  const loadAccount = useCallback(async (currentUser) => {
    if (!currentUser || !supabase) return;
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', currentUser.id).maybeSingle();
    if (!profile) {
      const fullName = currentUser.user_metadata?.full_name || currentUser.email || 'MEA BOKO member';
      await supabase.from('profiles').insert({ id: currentUser.id, full_name: fullName, role: 'buyer' });
    }
    const { data: application } = await supabase.from('supplier_applications')
      .select('id,status').eq('user_id', currentUser.id).eq('status', 'approved').limit(1).maybeSingle();
    setApproved(Boolean(application));
    const { data: ownListings } = await supabase.from('coffee_listings')
      .select('id,name,product_type,market,status,quantity_kg,price,currency,created_at')
      .eq('supplier_id', currentUser.id).order('created_at', { ascending: false });
    setListings(ownListings || []);
    const { data: originRows } = await supabase.from('origins').select('id,name,region').order('name');
    setOrigins(originRows || []);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session?.user) {
        setUser(data.session.user);
        loadAccount(data.session.user);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user || null);
      if (session?.user) loadAccount(session.user);
      else { setApproved(false); setListings([]); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadAccount]);

  async function submitAuth(event) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    let result;
    if (mode === 'signup') {
      result = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: String(form.get('full_name') || '').trim() } },
      });
      if (!result.error && !result.data.session) {
        setMessage('Account created. Check your email to confirm your address, then sign in.');
      }
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (result.data.session?.user) {
      setUser(result.data.session.user);
      await loadAccount(result.data.session.user);
      setMessage('You are signed in.');
    }
  }

  async function signOut() {
    setBusy(true);
    const { error: signOutError } = await supabase.auth.signOut();
    setBusy(false);
    if (signOutError) setError(signOutError.message);
    else { setUser(null); setMessage('You have signed out.'); }
  }

  async function addListing(event) {
    event.preventDefault();
    if (!user || !approved) return;
    const formElement = event.currentTarget;
    setBusy(true); setError(''); setMessage('');
    const form = new FormData(formElement);
    const quantity = String(form.get('quantity_kg') || '').trim();
    const price = String(form.get('price') || '').trim();
    const payload = {
      supplier_id: user.id,
      origin_id: String(form.get('origin_id') || '') || null,
      name: String(form.get('name') || '').trim(),
      product_type: String(form.get('product_type') || ''),
      market: String(form.get('market') || ''),
      process: String(form.get('process') || '').trim() || null,
      grade: String(form.get('grade') || '').trim() || null,
      description: String(form.get('description') || '').trim() || null,
      quantity_kg: quantity ? Number(quantity) : null,
      price: price ? Number(price) : null,
      currency: String(form.get('currency') || 'ETB'),
      status: 'pending',
    };
    const { error: insertError } = await supabase.from('coffee_listings').insert(payload);
    setBusy(false);
    if (insertError) setError(insertError.message);
    else {
      setMessage('Coffee listing submitted. It will appear publicly after MEA BOKO approval.');
      formElement.reset();
      await loadAccount(user);
    }
  }

  if (!isSupabaseConfigured) return <section className="account-section" id="account"><div className="account-card"><h2>Member account</h2><p>Supabase connection settings are needed before accounts can be used.</p></div></section>;

  return <section className="account-section" id="account">
    <div className="account-intro"><p className="eyebrow">YOUR MEA BOKO ACCOUNT</p><h2>Trade starts with<br />a trusted connection.</h2><p>Create an account to manage your coffee business, track your supplier application and submit products for review.</p></div>
    <div className="account-card">
      {error && <div className="notice error-notice">{error}</div>}
      {message && <div className="notice account-message">{message}</div>}
      {!user ? <>
        <div className="account-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button></div>
        <form onSubmit={submitAuth} className="account-form">
          {mode === 'signup' && <label>Full name<input name="full_name" required autoComplete="name" placeholder="Your full name" /></label>}
          <label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" required minLength="8" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="At least 8 characters" /></label>
          <button className="button button-gold form-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'} <span>↗</span></button>
        </form>
      </> : <>
        <div className="account-user"><div><span className="account-avatar">{(user.email || 'M').slice(0,1).toUpperCase()}</span><div><b>{user.user_metadata?.full_name || user.email}</b><small>{user.email}</small></div></div><button className="text-link" onClick={signOut} disabled={busy}>Sign out</button></div>
        <div className="supplier-status"><span className={approved ? 'status-dot live' : 'status-dot'} />Supplier status: <b>{approved ? 'Approved' : 'Approval pending'}</b></div>
        {!approved ? <div className="notice">To publish coffee products, submit the supplier registration form below while signed in. The MEA BOKO team must approve your application before listing tools are enabled.</div> : <>
          <h3 className="account-subhead">Add a coffee listing</h3>
          <form onSubmit={addListing} className="account-form">
            <label>Product name<input name="name" required placeholder="e.g. Guji Hambela Washed Grade 1" /></label>
            <div className="form-row"><label>Coffee type<select name="product_type" required defaultValue="green_beans"><option value="green_beans">Green coffee beans</option><option value="roasted_beans">Roasted coffee</option><option value="ground_coffee">Ground coffee</option></select></label><label>Market<select name="market" required defaultValue="both"><option value="domestic">Domestic</option><option value="export">International export</option><option value="both">Both markets</option></select></label></div>
            <div className="form-row"><label>Origin<select name="origin_id" defaultValue=""><option value="">Select origin</option>{origins.map((origin) => <option key={origin.id} value={origin.id}>{origin.name}{origin.region ? ' — '+origin.region : ''}</option>)}</select></label><label>Process<input name="process" placeholder="Washed / Natural / Honey" /></label></div>
            <div className="form-row"><label>Grade<input name="grade" placeholder="Grade 1 / Grade 2…" /></label><label>Quantity (kg)<input name="quantity_kg" type="number" min="0" step="0.01" placeholder="e.g. 500" /></label></div>
            <div className="form-row"><label>Price (optional)<input name="price" type="number" min="0" step="0.01" placeholder="Price per kg" /></label><label>Currency<select name="currency" defaultValue="ETB"><option>ETB</option><option>USD</option><option>EUR</option></select></label></div>
            <label>Description<textarea name="description" rows="3" placeholder="Describe your coffee, harvest and availability…" /></label>
            <button className="button button-gold form-submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit coffee listing'} <span>↗</span></button>
          </form>
        </>}
        <h3 className="account-subhead">Your coffee listings</h3>
        {listings.length ? <div className="own-listings">{listings.map((item) => <div key={item.id}><span><b>{item.name}</b><small>{item.product_type.replaceAll('_',' ')} · {item.market}</small></span><span className={'listing-status status-'+item.status}>{item.status}</span></div>)}</div> : <p className="account-hint">No coffee listings have been submitted from this account yet.</p>}
      </>}
    </div>
  </section>;
}
