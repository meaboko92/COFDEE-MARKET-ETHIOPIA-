import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';

export default function AccountPanel() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const [role, setRole] = useState('buyer');
  const [listings, setListings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderMessages, setOrderMessages] = useState([]);
  const [orderProposals, setOrderProposals] = useState([]);
  const [messageDrafts, setMessageDrafts] = useState({});
  const [priceDrafts, setPriceDrafts] = useState({});
  const [messageBusy, setMessageBusy] = useState({});
  const [origins, setOrigins] = useState([]);

  const loadAccount = useCallback(async (currentUser) => {
    if (!currentUser || !supabase) return;
    const { data: profile } = await supabase.from('profiles').select('id,role').eq('id', currentUser.id).maybeSingle();
    setRole(profile?.role || 'buyer');
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
    const orderSelect = 'id,buyer_id,listing_id,quantity_kg,agreed_price,currency,status,created_at,coffee_listings!inner(name,supplier_id)';
    const [buyerResult, supplierResult] = await Promise.all([
      supabase.from('orders').select(orderSelect).eq('buyer_id', currentUser.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('orders').select(orderSelect).eq('coffee_listings.supplier_id', currentUser.id).order('created_at', { ascending: false }).limit(50),
    ]);
    const orderMap = new Map();
    [...(buyerResult.data || []), ...(supplierResult.data || [])].forEach((order) => orderMap.set(order.id, order));
    const participantOrders = [...orderMap.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setOrders(participantOrders);
    if (participantOrders.length) {
      const { data: messages } = await supabase.from('order_messages')
        .select('id,order_id,sender_id,body,proposed_price,currency,created_at')
        .in('order_id', participantOrders.map((order) => order.id))
        .order('created_at', { ascending: true });
      setOrderMessages(messages || []);
      const { data: proposals } = await supabase.from('order_price_proposals')
        .select('id,order_id,proposer_id,amount,currency,status,responded_by,responded_at,created_at')
        .in('order_id', participantOrders.map((order) => order.id))
        .order('created_at', { ascending: false });
      setOrderProposals(proposals || []);
    } else {
      setOrderMessages([]);
      setOrderProposals([]);
    }
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
      else { setApproved(false); setListings([]); setOrders([]); setOrderMessages([]); setOrderProposals([]); setRole('buyer'); }
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
    else { setUser(null); setOrders([]); setOrderMessages([]); setListings([]); setMessage('You have signed out.'); }
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

  async function sendOrderMessage(orderId, event) {
    event.preventDefault();
    if (!user || !supabase) return;
    const body = String(messageDrafts[orderId] || '').trim();
    const rawPrice = String(priceDrafts[orderId] || '').trim();
    const proposedPrice = rawPrice ? Number(rawPrice) : null;
    if (!body && !rawPrice) return;
    if (rawPrice && (!Number.isFinite(proposedPrice) || proposedPrice <= 0)) {
      setError('Enter a price greater than zero, or leave the price field blank.');
      return;
    }
    setMessageBusy((current) => ({ ...current, [orderId]: true }));
    setError('');
    const order = orders.find((item) => item.id === orderId);
    if (body) {
      const { error: messageError } = await supabase.from('order_messages').insert({
        order_id: orderId, sender_id: user.id, body, currency: order?.currency || 'ETB',
      });
      if (messageError) {
        setMessageBusy((current) => ({ ...current, [orderId]: false }));
        setError(messageError.message);
        return;
      }
    }
    if (rawPrice) {
      const { error: proposalError } = await supabase.from('order_price_proposals').insert({
        order_id: orderId, proposer_id: user.id, amount: proposedPrice, currency: order?.currency || 'ETB',
      });
      if (proposalError) {
        setMessageBusy((current) => ({ ...current, [orderId]: false }));
        setError(proposalError.code === '23505' ? 'There is already a pending price proposal for this order. Respond to it before sending another.' : proposalError.message);
        return;
      }
    }
    setMessageBusy((current) => ({ ...current, [orderId]: false }));
    setMessageDrafts((current) => ({ ...current, [orderId]: '' }));
    setPriceDrafts((current) => ({ ...current, [orderId]: '' }));
    const orderIds = orders.map((item) => item.id);
    const [{ data: refreshed }, { data: refreshedProposals }] = await Promise.all([
      supabase.from('order_messages').select('id,order_id,sender_id,body,proposed_price,currency,created_at').in('order_id', orderIds).order('created_at', { ascending: true }),
      supabase.from('order_price_proposals').select('id,order_id,proposer_id,amount,currency,status,responded_by,responded_at,created_at').in('order_id', orderIds).order('created_at', { ascending: false }),
    ]);
    setOrderMessages(refreshed || []);
    setOrderProposals(refreshedProposals || []);
  }

  async function respondToPriceProposal(proposal, decision) {
    if (!user || !supabase || proposal.proposer_id === user.id || proposal.status !== 'pending') return;
    setMessageBusy((current) => ({ ...current, [proposal.order_id]: true }));
    setError('');
    const { data, error: responseError } = await supabase.from('order_price_proposals')
      .update({ status: decision, responded_by: user.id, responded_at: new Date().toISOString() })
      .eq('id', proposal.id).eq('status', 'pending')
      .select('id,status').maybeSingle();
    setMessageBusy((current) => ({ ...current, [proposal.order_id]: false }));
    if (responseError) { setError(responseError.message); return; }
    if (!data) { setError('This proposal has already been answered or is no longer available. Refresh your account.'); return; }
    await loadAccount(user);
    setMessage(decision === 'accepted' ? 'Price accepted. The order price is now confirmed.' : 'Price proposal declined.');
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
        {role === 'admin' ? <div className="supplier-status"><span className="status-dot live" />Account access: <b>Administrator</b></div> : <div className="supplier-status"><span className={approved ? 'status-dot live' : 'status-dot'} />Supplier status: <b>{approved ? 'Approved' : 'Approval pending'}</b></div>}
        {role === 'admin' ? <div className="notice account-message">Administrator access is active. Use the Admin Dashboard below to manage supplier applications, coffee listings and buyer inquiries.</div> : !approved ? <div className="notice">To publish coffee products, submit the supplier registration form below while signed in. The MEA BOKO team must approve your application before listing tools are enabled.</div> : <>
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
        <h3 className="account-subhead">Trade orders & private messages</h3>
        <p className="account-hint">Discuss order details directly with the other party. Only the buyer, the supplier for that listing, and MEA BOKO administrators can access these messages.</p>
        {orders.length ? <div className="trade-order-list">{orders.map((item) => {
          const isBuyer = item.buyer_id === user.id;
          const thread = orderMessages.filter((message) => message.order_id === item.id);
          return <article className="trade-order-card" key={item.id}>
            <div className="trade-order-head"><div><b>{item.coffee_listings?.name || 'Coffee order'}</b><small>{isBuyer ? 'Buyer view' : 'Supplier view'} · {Number(item.quantity_kg).toLocaleString()} kg · {item.agreed_price === null ? 'Price to be agreed' : Number(item.agreed_price).toLocaleString()+' '+item.currency}</small></div><span className={'listing-status status-'+item.status}>{item.status.replaceAll('_',' ')}</span></div>
            <div className="order-thread">{thread.length ? thread.map((message) => <div className={message.sender_id === user.id ? 'thread-message own-message' : 'thread-message'} key={message.id}><small>{message.sender_id === user.id ? 'You' : 'Trade partner'} · {new Date(message.created_at).toLocaleString()}</small>{message.body && <p>{message.body}</p>}{message.proposed_price !== null && <strong className="price-proposal">Earlier price note: {Number(message.proposed_price).toLocaleString()} {message.currency} / kg</strong>}</div>) : <p className="account-hint">No messages yet. Start the order discussion below.</p>}</div>
            <div className="price-proposal-list"><b>Price proposals</b>{orderProposals.filter((proposal) => proposal.order_id === item.id).length ? orderProposals.filter((proposal) => proposal.order_id === item.id).map((proposal) => {
              const isRecipient = proposal.proposer_id !== user.id;
              return <div className="price-proposal-card" key={proposal.id}><div><strong>{Number(proposal.amount).toLocaleString()} {proposal.currency} / kg</strong><small>{proposal.proposer_id === user.id ? 'Proposed by you' : 'Proposed by trade partner'} · {new Date(proposal.created_at).toLocaleString()}</small><span className={'listing-status status-'+proposal.status}>{proposal.status}</span></div>{proposal.status === 'pending' && isRecipient && <div className="admin-actions"><button type="button" className="button button-gold" disabled={Boolean(messageBusy[item.id])} onClick={() => respondToPriceProposal(proposal,'accepted')}>Accept price</button><button type="button" className="admin-danger" disabled={Boolean(messageBusy[item.id])} onClick={() => respondToPriceProposal(proposal,'declined')}>Decline</button></div>}</div>;
            }) : <p className="account-hint">No price proposals yet.</p>}</div>
            <form className="order-message-form" onSubmit={(event) => sendOrderMessage(item.id, event)}>
              <label>Message<textarea rows="2" maxLength="3000" value={messageDrafts[item.id] || ''} onChange={(event) => setMessageDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Discuss quality, delivery, documents or other order details…" /></label>
              <div className="form-row"><label>Propose price per kg ({item.currency})<input type="number" min="0.01" step="0.01" value={priceDrafts[item.id] || ''} onChange={(event) => setPriceDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Price per kg" /></label><button className="button button-dark" disabled={Boolean(messageBusy[item.id]) || (!String(messageDrafts[item.id] || '').trim() && !String(priceDrafts[item.id] || '').trim())}>{messageBusy[item.id] ? 'Sending…' : 'Send message'}</button></div>
            </form>
          </article>;
        })}</div> : <p className="account-hint">You have no buyer or supplier trade orders yet.</p>}
        <h3 className="account-subhead">Your coffee listings</h3>
        {listings.length ? <div className="own-listings">{listings.map((item) => <div key={item.id}><span><b>{item.name}</b><small>{item.product_type.replaceAll('_',' ')} · {item.market}</small></span><span className={'listing-status status-'+item.status}>{item.status}</span></div>)}</div> : <p className="account-hint">No coffee listings have been submitted from this account yet.</p>}
      </>}
    </div>
  </section>;
}
