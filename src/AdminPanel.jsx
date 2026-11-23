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
  const [shipments, setShipments] = useState([]);
  const [deliveryConfirmations, setDeliveryConfirmations] = useState([]);
  const [tradeDocuments, setTradeDocuments] = useState([]);
  const [exportDetails, setExportDetails] = useState([]);
  const [buyerProfiles, setBuyerProfiles] = useState([]);
  const [paymentRecords, setPaymentRecords] = useState([]);

  const loadDashboard = useCallback(async () => {
    if (!supabase) return;
    setError('');
    const [appsResult, listingsResult, inquiriesResult, ordersResult, shipmentsResult, deliveryConfirmationsResult, tradeDocumentsResult, exportDetailsResult, buyerProfilesResult, paymentsResult] = await Promise.all([
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
      supabase.from('order_shipments')
        .select('id,order_id,status,carrier,tracking_reference,dispatch_date,estimated_delivery_date,delivery_notes,created_at,updated_at')
        .order('updated_at', { ascending: false }).limit(100),
      supabase.from('order_delivery_confirmations')
        .select('id,shipment_id,order_id,buyer_id,confirmed_at')
        .order('confirmed_at', { ascending: false }).limit(100),
      supabase.from('order_trade_documents')
        .select('id,order_id,uploaded_by,document_type,original_filename,file_path,status,review_note,reviewed_at,created_at')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('order_export_details')
        .select('id,order_id,destination_country,destination_port,importer_company,buyer_reference,coffee_variety,grade,process,moisture_percent,crop_year,lot_reference,bag_count,bag_weight_kg,packaging,export_notes,updated_at')
        .order('updated_at', { ascending: false }).limit(200),
      supabase.from('buyer_business_profiles').select('buyer_id,company_name,country,city,business_type,website,preferred_origins,buyer_notes,updated_at').order('updated_at', { ascending: false }).limit(200),
      supabase.from('order_payment_records').select('id,order_id,submitted_by,amount,currency,payment_stage,payment_method,payment_reference,payment_date,notes,status,review_note,created_at,reviewed_at').order('created_at', { ascending: false }).limit(300),
    ]);
    const firstError = appsResult.error || listingsResult.error || inquiriesResult.error || ordersResult.error || shipmentsResult.error || deliveryConfirmationsResult.error || tradeDocumentsResult.error || exportDetailsResult.error || buyerProfilesResult.error || paymentsResult.error;
    if (firstError) setError(firstError.message);
    setApplications(appsResult.data || []);
    setListings(listingsResult.data || []);
    setInquiries(inquiriesResult.data || []);
    setOrders(ordersResult.data || []);
    setBuyerProfiles(buyerProfilesResult.data || []);
    setPaymentRecords(paymentsResult.data || []);
    setShipments(shipmentsResult.data || []);
    setDeliveryConfirmations(deliveryConfirmationsResult.data || []);
    setTradeDocuments(tradeDocumentsResult.data || []);
    setExportDetails(exportDetailsResult.data || []);
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

  function downloadFinancialReport() {
    const rows = [['Order ID','Order status','Quantity kg','Agreed price per kg','Currency','Order value','Verified payments','Outstanding balance','Payment record status','Payment amount','Payment date','Payment reference']];
    orders.forEach((order) => {
      const orderPayments = paymentRecords.filter((record) => record.order_id === order.id);
      const verifiedTotal = orderPayments.filter((record) => record.status === 'verified').reduce((sum, record) => sum + Number(record.amount || 0), 0);
      const orderValue = order.agreed_price == null ? null : Number(order.agreed_price) * Number(order.quantity_kg || 0);
      const balance = orderValue == null ? null : Math.max(0, orderValue - verifiedTotal);
      if (!orderPayments.length) {
        rows.push([order.id,order.status,order.quantity_kg,order.agreed_price ?? '',order.currency,orderValue ?? '',verifiedTotal,balance ?? '','','','','']);
      } else {
        orderPayments.forEach((record) => rows.push([
          order.id,order.status,order.quantity_kg,order.agreed_price ?? '',order.currency,orderValue ?? '',verifiedTotal,balance ?? '',
          record.status,record.amount,record.payment_date || '',record.payment_reference || '',
        ]));
      }
    });
    const csv = rows.map((row) => row.map((value) => '"' + String(value ?? '').replaceAll('"','""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'mea-boko-trade-financial-report.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function reviewPaymentRecord(record, status) {
    setBusyId(record.id); setError(''); setNotice('');
    const { data: authData } = await supabase.auth.getUser();
    const { error: updateError } = await supabase.from('order_payment_records')
      .update({ status, reviewed_by: authData.user?.id || null, reviewed_at: new Date().toISOString(), review_note: null })
      .eq('id', record.id).eq('status', 'pending');
    setBusyId('');
    if (updateError) { setError(updateError.message); return; }
    setNotice(status === 'verified' ? 'Payment record marked verified. Confirm funds independently before verification.' : 'Payment record rejected.');
    await loadDashboard();
  }

  async function reviewTradeDocument(document, status) {
    setBusyId(document.id); setError(''); setNotice('');
    const response = {
      status,
      reviewed_by: status === 'approved' || status === 'rejected' ? (await supabase.auth.getUser()).data.user?.id : null,
      reviewed_at: status === 'approved' || status === 'rejected' ? new Date().toISOString() : null,
    };
    const { error: updateError } = await supabase.from('order_trade_documents')
      .update(response).eq('id', document.id);
    setBusyId('');
    if (updateError) { setError(updateError.message); return; }
    setNotice('Trade document review updated.');
    await loadDashboard();
  }

  async function openTradeDocument(document) {
    const { data, error: urlError } = await supabase.storage.from('trade-documents').createSignedUrl(document.file_path, 60);
    if (urlError) { setError(urlError.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

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

  const financialSummary = ['ETB','USD','EUR'].map((currency) => {
    const currencyOrders = orders.filter((order) => order.currency === currency);
    const orderValue = currencyOrders.reduce((sum, order) => sum + (order.agreed_price == null ? 0 : Number(order.agreed_price) * Number(order.quantity_kg || 0)), 0);
    const verifiedPayments = paymentRecords.filter((record) => record.currency === currency && record.status === 'verified').reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const pendingPayments = paymentRecords.filter((record) => record.currency === currency && record.status === 'pending').reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const pricedOrderCount = currencyOrders.filter((order) => order.agreed_price != null).length;
    return { currency, orderValue, verifiedPayments, pendingPayments, outstanding: Math.max(0, orderValue - verifiedPayments), pricedOrderCount, orderCount: currencyOrders.length };
  });

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
    <div className="admin-block financial-report-block">
      <div className="admin-block-head"><h3>Financial reports & trade accounting</h3><button className="button button-dark" type="button" onClick={downloadFinancialReport}>Export CSV report ↓</button></div>
      <p className="account-hint">Summary covers the latest 100 orders and up to 300 payment records loaded by this dashboard. Order value is quantity × agreed price per kg. Only records marked verified are deducted; pending entries are shown separately.</p>
      <div className="admin-stats">
        {financialSummary.filter((item) => item.orderCount || item.pendingPayments || item.verifiedPayments).map((item) => <div key={item.currency}>
          <strong>{item.currency} {item.orderValue.toLocaleString(undefined,{maximumFractionDigits:2})}</strong>
          <span>Agreed order value · {item.pricedOrderCount}/{item.orderCount} priced orders</span>
          <small>Verified: {item.verifiedPayments.toLocaleString(undefined,{maximumFractionDigits:2})} · Pending: {item.pendingPayments.toLocaleString(undefined,{maximumFractionDigits:2})}</small>
          <small>Estimated outstanding: {item.outstanding.toLocaleString(undefined,{maximumFractionDigits:2})}</small>
        </div>)}
      </div>
      <p className="account-hint">Outstanding is an estimate based on recorded, verified payments. It does not include unrecorded payments, fees, taxes, freight adjustments, or disputed amounts. Balances are kept separate by currency.</p>
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>Trade payment records</h3><span>{paymentRecords.length} entries · {paymentRecords.filter((record) => record.status === 'pending').length} pending review</span></div>
      {paymentRecords.length ? paymentRecords.map((record) => {
        const order = orders.find((item) => item.id === record.order_id);
        return <article className="admin-record" key={record.id}>
          <div className="admin-record-main"><div><h4>{Number(record.amount).toLocaleString()} {record.currency}</h4><span className={'listing-status status-'+record.status}>{record.status}</span></div>
            <p>Order {record.order_id.slice(0,8).toUpperCase()} · {order ? Number(order.quantity_kg).toLocaleString()+' kg' : 'Order details unavailable'}</p>
            <p>{record.payment_stage.replaceAll('_',' ')} · {record.payment_method.replaceAll('_',' ')} · {record.payment_date || 'Date not supplied'}</p>
            {record.payment_reference && <p>Reference: {record.payment_reference}</p>}
            {record.notes && <p>{record.notes}</p>}
            <small>Submitted {new Date(record.created_at).toLocaleString()} · Account {record.submitted_by.slice(0,8).toUpperCase()}</small>
            {record.review_note && <p>Review note: {record.review_note}</p>}
          </div>
          {record.status === 'pending' && <div className="admin-actions">
            <button className="button button-gold" disabled={busyId===record.id} onClick={() => reviewPaymentRecord(record,'verified')}>Mark verified</button>
            <button className="admin-danger" disabled={busyId===record.id} onClick={() => reviewPaymentRecord(record,'rejected')}>Reject record</button>
          </div>}
        </article>;
      }) : <p className="admin-empty">No payment records have been submitted yet.</p>}
      <p className="account-hint">Verification is an internal record status only. Confirm funds with the relevant payment provider or bank before marking a record verified. MEA BOKO does not process these payments.</p>
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>International buyer directory</h3><span>{buyerProfiles.length} profiles</span></div>
      {buyerProfiles.length ? buyerProfiles.map((buyer) => <article className="admin-record" key={buyer.buyer_id}>
        <div className="admin-record-main"><div><h4>{buyer.company_name || 'Buyer company not provided'}</h4><span className="listing-status status-approved">{buyer.business_type.replaceAll('_',' ')}</span></div>
          <p>{[buyer.city,buyer.country].filter(Boolean).join(', ') || 'Location not provided'}</p>
          {buyer.preferred_origins?.length > 0 && <p>Preferred origins: {buyer.preferred_origins.join(', ')}</p>}
          {buyer.website && <p><a href={buyer.website} target="_blank" rel="noreferrer">{buyer.website}</a></p>}
          {buyer.buyer_notes && <p>{buyer.buyer_notes}</p>}
          <small>Updated {new Date(buyer.updated_at).toLocaleString()}</small>
        </div>
      </article>) : <p className="admin-empty">No buyer business profiles have been added yet.</p>}
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
      <div className="admin-block-head"><h3>Delivery tracking</h3><span>{shipments.length} shipments · {deliveryConfirmations.length} receipts confirmed</span></div>
      {shipments.length ? shipments.map((shipment) => {
        const order = orders.find((record) => record.id === shipment.order_id);
        const receipt = deliveryConfirmations.find((record) => record.shipment_id === shipment.id);
        return <article className="admin-record" key={shipment.id}>
          <div className="admin-record-main"><div><h4>Order {shipment.order_id.slice(0,8).toUpperCase()}</h4><span className={'listing-status status-'+shipment.status}>{shipment.status.replaceAll('_',' ')}</span></div>
            <p>Quantity: {order ? Number(order.quantity_kg).toLocaleString()+' kg' : 'Order details unavailable'}</p>
            <p>Carrier: {shipment.carrier || 'Not specified'} · Tracking: {shipment.tracking_reference || 'Not provided'}</p>
            <p>Dispatch: {shipment.dispatch_date || 'Not set'} · Estimated delivery: {shipment.estimated_delivery_date || 'Not set'}</p>
            {shipment.delivery_notes && <p>{shipment.delivery_notes}</p>}
            <small>{receipt ? 'Buyer confirmed receipt: '+new Date(receipt.confirmed_at).toLocaleString() : 'Awaiting buyer receipt confirmation'}</small>
          </div>
        </article>;
      }) : <p className="admin-empty">No shipments have been registered yet. Suppliers can add tracking details after an order is confirmed.</p>}
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>Export operations report</h3><span>{exportDetails.length} shipment profiles</span></div>
      <div className="export-report-stats">
        <div><b>{exportDetails.length}</b><small>Profiles recorded</small></div>
        <div><b>{new Set(exportDetails.map((row) => row.destination_country.trim().toLowerCase())).size}</b><small>Destination countries</small></div>
        <div><b>{exportDetails.reduce((sum,row) => sum + (Number(orders.find((order) => order.id === row.order_id)?.quantity_kg) || 0),0).toLocaleString()} kg</b><small>Order quantity in profiles</small></div>
        <div><b>{tradeDocuments.filter((doc) => doc.status === 'uploaded' || doc.status === 'under_review').length}</b><small>Documents awaiting review</small></div>
      </div>
      {exportDetails.length ? exportDetails.map((row) => {
        const order = orders.find((item) => item.id === row.order_id);
        const shipment = shipments.find((item) => item.order_id === row.order_id);
        const docs = tradeDocuments.filter((doc) => doc.order_id === row.order_id);
        return <article className="admin-record" key={row.id}>
          <div className="admin-record-main"><div><h4>{row.destination_country}{row.destination_port ? ' · '+row.destination_port : ''}</h4><span className={'listing-status status-'+(shipment?.status || 'preparing')}>{shipment?.status?.replaceAll('_',' ') || 'shipment not created'}</span></div>
            <p>Order {row.order_id.slice(0,8).toUpperCase()} · {order ? Number(order.quantity_kg).toLocaleString()+' kg' : 'Order quantity unavailable'} · Buyer account {order?.buyer_id?.slice(0,8).toUpperCase() || '—'}</p>
            <p>Importer: {row.importer_company || 'Not recorded'}{row.buyer_reference ? ' · Buyer ref: '+row.buyer_reference : ''}</p>
            <p>Coffee: {[row.coffee_variety,row.grade,row.process].filter(Boolean).join(' · ') || 'Specification incomplete'}</p>
            <p>Quality: {row.moisture_percent != null ? row.moisture_percent+'% moisture' : 'Moisture not recorded'} · Crop: {row.crop_year || '—'} · Lot: {row.lot_reference || '—'}</p>
            <p>Packaging: {row.bag_count ?? '—'} bags{row.bag_weight_kg ? ' × '+row.bag_weight_kg+' kg' : ''} · {row.packaging || 'Packaging not recorded'} · Documents: {docs.length}</p>
            <small>Updated {new Date(row.updated_at).toLocaleString()}</small>
          </div>
        </article>;
      }) : <p className="admin-empty">No export shipment profiles have been recorded yet.</p>}
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>Export trade documents</h3><span>{tradeDocuments.length} files · {tradeDocuments.filter((doc) => doc.status === 'uploaded' || doc.status === 'under_review').length} awaiting review</span></div>
      {tradeDocuments.length ? tradeDocuments.map((doc) => <article className="admin-record" key={doc.id}>
        <div className="admin-record-main"><div><h4>{doc.original_filename}</h4><span className={'listing-status status-'+doc.status}>{doc.status.replaceAll('_',' ')}</span></div>
          <p>Order: {doc.order_id.slice(0,8).toUpperCase()} · Type: {doc.document_type.replaceAll('_',' ')}</p>
          <small>Uploaded {new Date(doc.created_at).toLocaleString()}</small>
          {doc.review_note && <p>Review note: {doc.review_note}</p>}
          <button type="button" className="text-link" onClick={() => openTradeDocument(doc)}>Open private file ↗</button>
        </div>
        <div className="admin-actions">
          {doc.status === 'uploaded' && <button className="admin-secondary" disabled={busyId===doc.id} onClick={() => reviewTradeDocument(doc,'under_review')}>Start review</button>}
          {doc.status !== 'approved' && <button className="button button-gold" disabled={busyId===doc.id} onClick={() => reviewTradeDocument(doc,'approved')}>Approve</button>}
          {doc.status !== 'rejected' && <button className="admin-danger" disabled={busyId===doc.id} onClick={() => reviewTradeDocument(doc,'rejected')}>Reject</button>}
        </div>
      </article>) : <p className="admin-empty">No export documents have been uploaded.</p>}
    </div>
    <div className="admin-block">
      <div className="admin-block-head"><h3>Trade order management</h3><span>{activeOrders.length} active</span></div>
      {orders.length ? orders.map((item) => <article className="admin-record" key={item.id}>
        <div className="admin-record-main"><div><h4>Order {item.id.slice(0,8).toUpperCase()}</h4><span className={'listing-status status-'+item.status}>{item.status}</span></div><p>Buyer account: {item.buyer_id}</p><p>Listing reference: {item.listing_id}</p><p>Quantity: {Number(item.quantity_kg).toLocaleString()} kg · Agreed price: {item.agreed_price ?? 'Not agreed'} {item.currency}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
        <div className="admin-actions">{item.status !== 'negotiating' && !['fulfilled','cancelled'].includes(item.status) && <button className="admin-secondary" disabled={busyId===item.id} onClick={() => changeStatus('orders',item.id,'negotiating')}>Negotiating</button>}{!['confirmed','fulfilled','cancelled'].includes(item.status) && <button className="button button-gold" disabled={busyId===item.id} onClick={() => changeStatus('orders',item.id,'confirmed')}>Confirm order</button>}{item.status === 'confirmed' && <button className="button button-gold" disabled={busyId===item.id} onClick={() => changeStatus('orders',item.id,'fulfilled')}>Mark fulfilled</button>}{!['fulfilled','cancelled'].includes(item.status) && <button className="admin-danger" disabled={busyId===item.id} onClick={() => changeStatus('orders',item.id,'cancelled')}>Cancel</button>}</div>
      </article>) : <p className="admin-empty">No trade orders yet.</p>}
    </div>
  </section>;
}
