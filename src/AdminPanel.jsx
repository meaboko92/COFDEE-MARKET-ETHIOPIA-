import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

export default function AdminPanel() {
  const [admin, setAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [applications, setApplications] = useState([]);
  const [listings, setListings] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [orders, setOrders] = useState([]);

  const loadDashboard = useCallback(async () => {
    if (!supabase) return;
    setError('');
    const [appsResult, listingsResult, inquiriesResult, ordersResult] = await Promise.all([
      supabase.from('supplier_applications')
        .select('id,user_id,contact_person,business_name,email,phone,business_role,market_interest,coffee_details,status,created_at')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('coffee_listings')
        .select('id,name,product_type,market,process,grade,quantity_kg,price,currency,status,created_at,origins(name,region)')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('inquiries')
        .select('id,listing_id,name,email,phone,message,status,created_at')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('orders')
        .select('id,buyer_id,listing_id,quantity_kg,agreed_price,currency,status,created_at')
        .order('created_at', { ascending: false }).limit(100),
    ]);
    const firstError = appsResult.error || listingsResult.error || inquiriesResult.error || ordersResult.error;
    if (firstError) setError(firstError.message);
    setApplications(appsResult.data || []);
    setListings(listingsResult.data || []);
    setInquiries(inquiriesResult.data || []);
    setOrders(ordersResult.data || []);
  }, []);

  const checkAdmin = useCallback(async (currentUser) => {
    if (!currentUser || !supabase) {
      setAdmin(false);
      setChecking(false);
      return;
    }
    const { data, error: profileError } = await supabase.from('profiles')
      .select('role').eq('id', currentUser.id).maybeSingle();
    setAdmin(!profileError && data?.role === 'admin');
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) checkAdmin(data.session.user);
      else setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setChecking(true);
      if (session?.user) checkAdmin(session.user);
      else { setAdmin(false); setChecking(false); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [checkAdmin]);

  useEffect(() => {
    if (admin) loadDashboard();
  }, [admin, loadDashboard]);

  async function changeStatus(table, id, status) {
    setBusyId(id); setError(''); setNotice('');
    const { error: updateError } = await supabase.from(table).update({ status }).eq('id', id);
    setBusyId('');
    if (updateError) { setError(updateError.message); return; }
    setNotice('Record updated successfully.');
    await loadDashboard();
  }

  if (!isSupabaseConfigured || checking || !admin) return null;

  const pendingApplications = applications.filter((item) => item.status === 'pending' || item.status === 'under_review');
  const pendingListings = listings.filter((item) => item.status === 'pending');
  const openInquiries = inquiries.filter((item) => item.status !== 'closed');
  const activeOrders = orders.filter((item) => !['fulfilled','cancelled'].includes(item.status));

  return <section className="admin-section" id="admin">
    <div className="admin-heading"><div><p className="eyebrow">PRIVATE MANAGEMENT</p><h2>MEA BOKO Admin Dashboard</h2><p>Review supplier applications, moderate coffee listings and follow buyer inquiries.</p></div><button className="button button-dark" onClick={loadDashboard}>Refresh dashboard ↻</button></div>
    {error && <div className="notice error-notice">{error}</div>}
    {notice && <div className="notice account-message">{notice}</div>}
    <div className="admin-stats">
      <div><strong>{applications.length}</strong><span>Supplier applications</span><small>{pendingApplications.length} awaiting review</small></div>
      <div><strong>{listings.length}</strong><span>Coffee listings</span><small>{pendingListings.length} awaiting approval</small></div>
      <div><strong>{inquiries.length}</strong><span>Buyer inquiries</span><small>{openInquiries.length} open</small></div>
      <div><strong>{orders.length}</strong><span>Trade orders</span><small>{activeOrders.length} active</small></div>
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>Supplier applications</h3><span>{pendingApplications.length} to review</span></div>
      {applications.length ? applications.map((item) => <article className="admin-record" key={item.id}>
        <div className="admin-record-main"><div><h4>{item.business_name}</h4><span className={'listing-status status-'+item.status}>{item.status.replace('_',' ')}</span></div><p>{item.contact_person} · {item.business_role}</p><p><a href={'mailto:'+item.email}>{item.email}</a> · {item.phone}</p><p>Market: {item.market_interest}</p>{item.coffee_details && <p>{item.coffee_details}</p>}<small>{new Date(item.created_at).toLocaleString()}</small></div>
        <div className="admin-actions">{item.status !== 'approved' && <button className="button button-gold" disabled={busyId===item.id} onClick={() => changeStatus('supplier_applications',item.id,'approved')}>Approve supplier</button>}{item.status !== 'under_review' && item.status !== 'approved' && <button className="admin-secondary" disabled={busyId===item.id} onClick={() => changeStatus('supplier_applications',item.id,'under_review')}>Under review</button>}{item.status !== 'rejected' && <button className="admin-danger" disabled={busyId===item.id} onClick={() => changeStatus('supplier_applications',item.id,'rejected')}>Reject</button>}</div>
      </article>) : <p className="admin-empty">No supplier applications yet.</p>}
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>Coffee listing moderation</h3><span>{pendingListings.length} to review</span></div>
      {listings.length ? listings.map((item) => <article className="admin-record" key={item.id}>
        <div className="admin-record-main"><div><h4>{item.name}</h4><span className={'listing-status status-'+item.status}>{item.status.replace('_',' ')}</span></div><p>{item.origins?.name || 'Ethiopia'} · {item.product_type.replaceAll('_',' ')} · {item.market}</p><p>{item.process || 'Process not specified'} · {item.grade || 'Grade not specified'}</p><p>{item.quantity_kg ?? 'Quantity not specified'} kg · {item.price ?? 'Price on request'} {item.currency}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
        <div className="admin-actions">{item.status !== 'approved' && <button className="button button-gold" disabled={busyId===item.id} onClick={() => changeStatus('coffee_listings',item.id,'approved')}>Approve listing</button>}{item.status !== 'rejected' && <button className="admin-danger" disabled={busyId===item.id} onClick={() => changeStatus('coffee_listings',item.id,'rejected')}>Reject</button>}{item.status === 'approved' && <button className="admin-secondary" disabled={busyId===item.id} onClick={() => changeStatus('coffee_listings',item.id,'sold_out')}>Mark sold out</button>}</div>
      </article>) : <p className="admin-empty">No coffee listings submitted yet.</p>}
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>Buyer inquiries</h3><span>{openInquiries.length} open</span></div>
      {inquiries.length ? inquiries.map((item) => <article className="admin-record" key={item.id}>
        <div className="admin-record-main"><div><h4>{item.name}</h4><span className={'listing-status status-'+item.status}>{item.status.replace('_',' ')}</span></div><p><a href={'mailto:'+item.email}>{item.email}</a>{item.phone ? ' · '+item.phone : ''}</p><p>{item.message}</p><small>Listing reference: {item.listing_id || 'General inquiry'} · {new Date(item.created_at).toLocaleString()}</small></div>
        <div className="admin-actions">{item.status !== 'in_progress' && item.status !== 'closed' && <button className="admin-secondary" disabled={busyId===item.id} onClick={() => changeStatus('inquiries',item.id,'in_progress')}>Mark in progress</button>}{item.status !== 'closed' && <button className="button button-gold" disabled={busyId===item.id} onClick={() => changeStatus('inquiries',item.id,'closed')}>Close inquiry</button>}</div>
      </article>) : <p className="admin-empty">No buyer inquiries yet.</p>}
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>Trade order management</h3><span>{activeOrders.length} active</span></div>
      {orders.length ? orders.map((item) => <article className="admin-record" key={item.id}>
        <div className="admin-record-main"><div><h4>Order {item.id.slice(0,8).toUpperCase()}</h4><span className={'listing-status status-'+item.status}>{item.status}</span></div><p>Buyer account: {item.buyer_id}</p><p>Listing reference: {item.listing_id}</p><p>Quantity: {Number(item.quantity_kg).toLocaleString()} kg · Agreed price: {item.agreed_price ?? 'Not agreed'} {item.currency}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
        <div className="admin-actions">{item.status !== 'negotiating' && !['fulfilled','cancelled'].includes(item.status) && <button className="admin-secondary" disabled={busyId===item.id} onClick={() => changeStatus('orders',item.id,'negotiating')}>Negotiating</button>}{!['confirmed','fulfilled','cancelled'].includes(item.status) && <button className="button button-gold" disabled={busyId===item.id} onClick={() => changeStatus('orders',item.id,'confirmed')}>Confirm order</button>}{item.status === 'confirmed' && <button className="button button-gold" disabled={busyId===item.id} onClick={() => changeStatus('orders',item.id,'fulfilled')}>Mark fulfilled</button>}{!['fulfilled','cancelled'].includes(item.status) && <button className="admin-danger" disabled={busyId===item.id} onClick={() => changeStatus('orders',item.id,'cancelled')}>Cancel</button>}</div>
      </article>) : <p className="admin-empty">No trade orders yet.</p>}
    </div>
    </div>
  </section>;
}
