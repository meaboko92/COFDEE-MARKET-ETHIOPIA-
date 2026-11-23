import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';

const tradeDocumentTypes = [
  ['commercial_invoice','Commercial invoice'],['packing_list','Packing list'],['certificate_of_origin','Certificate of origin'],
  ['phytosanitary_certificate','Phytosanitary certificate'],['quality_certificate','Coffee quality certificate'],
  ['export_permit','Export permit / authorization'],['bill_of_lading','Bill of lading'],['other','Other supporting document'],
];

export default function AccountPanel() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const [supplierApplication, setSupplierApplication] = useState(null);
  const [verificationDocs, setVerificationDocs] = useState([]);
  const [role, setRole] = useState('buyer');
  const [listings, setListings] = useState([]);
  const [inventoryHistory, setInventoryHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderMessages, setOrderMessages] = useState([]);
  const [orderProposals, setOrderProposals] = useState([]);
  const [orderShipments, setOrderShipments] = useState([]);
  const [deliveryConfirmations, setDeliveryConfirmations] = useState([]);
  const [tradeDocuments, setTradeDocuments] = useState([]);
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [exportDetails, setExportDetails] = useState([]);
  const [messageDrafts, setMessageDrafts] = useState({});
  const [priceDrafts, setPriceDrafts] = useState({});
  const [quoteDrafts, setQuoteDrafts] = useState({});
  const [messageBusy, setMessageBusy] = useState({});
  const [origins, setOrigins] = useState([]);
  const [buyerBusiness, setBuyerBusiness] = useState({ company_name: '', country: '', city: '', business_type: 'importer', website: '', preferred_origins: [], buyer_notes: '' });
  const [buyerBusinessProfiles, setBuyerBusinessProfiles] = useState([]);

  const loadAccount = useCallback(async (currentUser) => {
    if (!currentUser || !supabase) return;
    const { data: profile } = await supabase.from('profiles').select('id,role').eq('id', currentUser.id).maybeSingle();
    const currentRole = profile?.role || 'buyer';
    setRole(currentRole);
    if (!profile) {
      const fullName = currentUser.user_metadata?.full_name || currentUser.email || 'MEA BOKO member';
      await supabase.from('profiles').insert({ id: currentUser.id, full_name: fullName, role: 'buyer' });
    }
    if (currentRole === 'buyer') {
      const { data: buyerProfile } = await supabase.from('buyer_business_profiles').select('company_name,country,city,business_type,website,preferred_origins,buyer_notes').eq('buyer_id', currentUser.id).maybeSingle();
      setBuyerBusiness({ company_name: buyerProfile?.company_name || '', country: buyerProfile?.country || '', city: buyerProfile?.city || '', business_type: buyerProfile?.business_type || 'importer', website: buyerProfile?.website || '', preferred_origins: buyerProfile?.preferred_origins || [], buyer_notes: buyerProfile?.buyer_notes || '' });
    } else { setBuyerBusiness({ company_name: '', country: '', city: '', business_type: 'importer', website: '', preferred_origins: [], buyer_notes: '' }); }
    const { data: verification } = await supabase.from('verified_suppliers')
      .select('user_id,verified_at').eq('user_id', currentUser.id).maybeSingle();
    setApproved(Boolean(verification));
    const { data: latestApplication } = await supabase.from('supplier_applications')
      .select('id,business_name,status,created_at').eq('user_id', currentUser.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setSupplierApplication(latestApplication || null);
    if (latestApplication) {
      const { data: documents } = await supabase.from('supplier_verification_documents')
        .select('id,document_type,original_file_name,status,review_note,reviewed_at,created_at')
        .eq('application_id', latestApplication.id).order('created_at', { ascending: false });
      setVerificationDocs(documents || []);
    } else setVerificationDocs([]);
    const { data: ownListings } = await supabase.from('coffee_listings')
      .select('id,name,product_type,market,status,quantity_kg,reserved_quantity_kg,available_quantity_kg,low_stock_threshold_kg,price,currency,created_at')
      .eq('supplier_id', currentUser.id).order('created_at', { ascending: false });
    setListings(ownListings || []);
    if (ownListings?.length) {
      const { data: historyRows } = await supabase.from('coffee_inventory_history')
        .select('id,listing_id,previous_quantity_kg,new_quantity_kg,previous_threshold_kg,new_threshold_kg,change_type,created_at,coffee_listings(name)')
        .in('listing_id', ownListings.map((listing) => listing.id))
        .order('created_at', { ascending: false }).limit(100);
      setInventoryHistory(historyRows || []);
    } else setInventoryHistory([]);
    const orderSelect = 'id,buyer_id,listing_id,quantity_kg,agreed_price,currency,status,created_at,coffee_listings!inner(name,supplier_id,market)';
    const [buyerResult, supplierResult] = await Promise.all([
      supabase.from('orders').select(orderSelect).eq('buyer_id', currentUser.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('orders').select(orderSelect).eq('coffee_listings.supplier_id', currentUser.id).order('created_at', { ascending: false }).limit(50),
    ]);
    const orderMap = new Map();
    [...(buyerResult.data || []), ...(supplierResult.data || [])].forEach((order) => orderMap.set(order.id, order));
    const participantOrders = [...orderMap.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setOrders(participantOrders);
    if (participantOrders.length) {
      const buyerIds = [...new Set(participantOrders.map((order) => order.buyer_id))];
      const { data: businessProfiles } = await supabase.from('buyer_business_profiles')
        .select('buyer_id,company_name,country,city,business_type,website,preferred_origins,buyer_notes')
        .in('buyer_id', buyerIds);
      setBuyerBusinessProfiles(businessProfiles || []);
      const { data: messages } = await supabase.from('order_messages')
        .select('id,order_id,sender_id,body,proposed_price,currency,created_at')
        .in('order_id', participantOrders.map((order) => order.id))
        .order('created_at', { ascending: true });
      setOrderMessages(messages || []);
      const { data: proposals } = await supabase.from('order_price_proposals')
        .select('id,order_id,proposer_id,amount,currency,status,responded_by,responded_at,created_at,incoterm,quote_valid_until,freight_per_kg,insurance_per_kg,origin_charges_per_kg,destination_charges_per_kg,quote_notes')
        .in('order_id', participantOrders.map((order) => order.id))
        .order('created_at', { ascending: false });
      setOrderProposals(proposals || []);
      const [{ data: shipments }, { data: confirmations }] = await Promise.all([
        supabase.from('order_shipments').select('id,order_id,status,carrier,tracking_reference,dispatch_date,estimated_delivery_date,delivery_notes,created_at,updated_at')
          .in('order_id', participantOrders.map((order) => order.id)),
        supabase.from('order_delivery_confirmations').select('id,shipment_id,order_id,buyer_id,confirmed_at')
          .in('order_id', participantOrders.map((order) => order.id)),
      ]);
      setOrderShipments(shipments || []);
      setDeliveryConfirmations(confirmations || []);
      const { data: documents } = await supabase.from('order_trade_documents')
        .select('id,order_id,uploaded_by,document_type,original_filename,file_path,status,review_note,reviewed_at,created_at')
        .in('order_id', participantOrders.map((order) => order.id))
        .order('created_at', { ascending: false });
      setTradeDocuments(documents || []);
      const { data: exportRows } = await supabase.from('order_export_details')
        .select('id,order_id,destination_country,destination_port,importer_company,buyer_reference,coffee_variety,grade,process,moisture_percent,crop_year,lot_reference,bag_count,bag_weight_kg,packaging,export_notes,updated_by,updated_at')
        .in('order_id', participantOrders.map((order) => order.id));
      setExportDetails(exportRows || []);
      const { data: payments } = await supabase.from('order_payment_records')
        .select('id,order_id,submitted_by,amount,currency,payment_stage,payment_method,payment_reference,payment_date,notes,status,review_note,created_at,reviewed_at')
        .in('order_id', participantOrders.map((order) => order.id)).order('created_at', { ascending: false });
      setPaymentRecords(payments || []);
    } else {
      setBuyerBusinessProfiles([]);
      setOrderMessages([]);
      setOrderProposals([]);
      setOrderShipments([]);
      setDeliveryConfirmations([]);
      setTradeDocuments([]);
      setExportDetails([]);
      setPaymentRecords([]);
    }
    const { data: notificationRows } = await supabase.from('user_notifications')
      .select('id,event_type,title,body,entity_id,created_at,read_at')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(30);
    setNotifications(notificationRows || []);
    const { data: originRows } = await supabase.from('origins').select('id,name,region,origin_level,parent_id,sort_order').eq('is_active', true).order('sort_order').order('name');
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
      else { setApproved(false); setSupplierApplication(null); setVerificationDocs([]); setListings([]); setNotifications([]); setInventoryHistory([]); setOrders([]); setOrderMessages([]); setOrderProposals([]); setOrderShipments([]); setDeliveryConfirmations([]); setTradeDocuments([]); setExportDetails([]); setPaymentRecords([]); setRole('buyer'); }
    });
    const refreshSupplierApplication = async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted && data.user) loadAccount(data.user);
    };
    window.addEventListener('mea-boko-supplier-application-updated', refreshSupplierApplication);
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.removeEventListener('mea-boko-supplier-application-updated', refreshSupplierApplication);
    };
  }, [loadAccount]);

  useEffect(() => {
    if (!user || !supabase) return undefined;
    const channel = supabase.channel('user-notifications-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'user_notifications',
        filter: 'user_id=eq.' + user.id,
      }, async () => {
        const { data } = await supabase.from('user_notifications')
          .select('id,event_type,title,body,entity_id,created_at,read_at')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
        setNotifications(data || []);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function markNotificationRead(notificationId) {
    if (!user || !supabase) return;
    const { error: updateError } = await supabase.from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId).eq('user_id', user.id).is('read_at', null);
    if (updateError) { setError(updateError.message); return; }
    setNotifications((current) => current.map((item) =>
      item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item));
  }

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
        options: {
          data: { full_name: String(form.get('full_name') || '').trim() },
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        },
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
    else { setUser(null); setSupplierApplication(null); setVerificationDocs([]); setApproved(false); setNotifications([]); setInventoryHistory([]); setOrders([]); setOrderMessages([]); setOrderProposals([]); setOrderShipments([]); setDeliveryConfirmations([]); setTradeDocuments([]); setExportDetails([]); setPaymentRecords([]); setListings([]); setMessage('You have signed out.'); }
  }

  async function uploadSupplierVerificationDocument(event) {
    event.preventDefault();
    if (!supabase || !user || !supplierApplication) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get('business_document');
    const documentType = String(form.get('document_type') || '');
    const allowedTypes = ['application/pdf','image/jpeg','image/png'];
    if (!(file instanceof File) || !file.size) { setError('Choose a business document to upload.'); return; }
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Upload a PDF, JPG or PNG file no larger than 10 MB.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'business-document';
    const filePath = user.id + '/' + supplierApplication.id + '/' + Date.now() + '-' + safeName;
    const { error: uploadError } = await supabase.storage.from('supplier-verification')
      .upload(filePath, file, { contentType: file.type, upsert: false });
    if (uploadError) { setBusy(false); setError(uploadError.message); return; }
    const { error: insertError } = await supabase.from('supplier_verification_documents').insert({
      user_id: user.id,
      application_id: supplierApplication.id,
      document_type: documentType,
      file_path: filePath,
      original_file_name: file.name.slice(0, 180),
      mime_type: file.type,
      file_size_bytes: file.size,
    });
    if (insertError) {
      await supabase.storage.from('supplier-verification').remove([filePath]);
      setBusy(false); setError(insertError.message); return;
    }
    setBusy(false); setMessage('Business document uploaded securely for administrator review.');
    formElement.reset();
    await loadAccount(user);
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

  async function updateListingInventory(listing, event) {
    event.preventDefault();
    if (!user || listing.status !== 'approved') return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const quantity = Number(form.get('quantity_kg'));
    const threshold = Number(form.get('low_stock_threshold_kg'));
    if (!Number.isFinite(quantity) || quantity < Number(listing.reserved_quantity_kg || 0)) {
      setError('Stock quantity cannot be lower than the reserved quantity.');
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      setError('Low-stock threshold must be zero or greater.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    const { error: updateError } = await supabase.from('coffee_listings')
      .update({ quantity_kg: quantity, low_stock_threshold_kg: threshold })
      .eq('id', listing.id).eq('supplier_id', user.id).eq('status', 'approved');
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    setMessage('Inventory updated. Available stock and inventory history have been refreshed.');
    await loadAccount(user);
  }

  async function sendOrderMessage(orderId, event) {
    event.preventDefault();
    if (!user || !supabase) return;
    const body = String(messageDrafts[orderId] || '').trim();
    const rawPrice = String(priceDrafts[orderId] || '').trim();
    const proposedPrice = rawPrice ? Number(rawPrice) : null;
    const quote = quoteDrafts[orderId] || {};
    const hasQuoteFields = Object.values(quote).some((value) => String(value || '').trim());
    const order = orders.find((item) => item.id === orderId);
    const isExportOrder = ['export','both'].includes(order?.coffee_listings?.market);
    if (!body && !rawPrice && !hasQuoteFields) return;
    if (rawPrice && (!Number.isFinite(proposedPrice) || proposedPrice <= 0)) {
      setError('Enter a price greater than zero, or leave the price field blank.');
      return;
    }
    if (hasQuoteFields && (!isExportOrder || !rawPrice)) {
      setError('Add a price per kg to send export quotation terms.');
      return;
    }
    const costFields = ['freight_per_kg','insurance_per_kg','origin_charges_per_kg','destination_charges_per_kg'];
    const costs = {};
    for (const field of costFields) {
      const raw = String(quote[field] || '').trim();
      const value = raw ? Number(raw) : null;
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        setError('Quotation cost fields must be zero or greater.');
        return;
      }
      costs[field] = value;
    }
    setMessageBusy((current) => ({ ...current, [orderId]: true }));
    setError('');
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
      const quotePayload = isExportOrder ? {
        incoterm: quote.incoterm || null,
        quote_valid_until: quote.quote_valid_until || null,
        freight_per_kg: costs.freight_per_kg,
        insurance_per_kg: costs.insurance_per_kg,
        origin_charges_per_kg: costs.origin_charges_per_kg,
        destination_charges_per_kg: costs.destination_charges_per_kg,
        quote_notes: String(quote.quote_notes || '').trim() || null,
      } : {};
      const { error: proposalError } = await supabase.from('order_price_proposals').insert({
        order_id: orderId, proposer_id: user.id, amount: proposedPrice, currency: order?.currency || 'ETB',
        ...quotePayload,
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
    setQuoteDrafts((current) => ({ ...current, [orderId]: {} }));
    const orderIds = orders.map((item) => item.id);
    const [{ data: refreshed }, { data: refreshedProposals }] = await Promise.all([
      supabase.from('order_messages').select('id,order_id,sender_id,body,proposed_price,currency,created_at').in('order_id', orderIds).order('created_at', { ascending: true }),
      supabase.from('order_price_proposals').select('id,order_id,proposer_id,amount,currency,status,responded_by,responded_at,created_at,incoterm,quote_valid_until,freight_per_kg,insurance_per_kg,origin_charges_per_kg,destination_charges_per_kg,quote_notes').in('order_id', orderIds).order('created_at', { ascending: false }),
    ]);
    setOrderMessages(refreshed || []);
    setOrderProposals(refreshedProposals || []);
  }

  async function submitPaymentRecord(order, event) {
    event.preventDefault();
    if (!user || !supabase || !['confirmed','fulfilled'].includes(order.status)) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(form.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a payment amount greater than zero.'); return; }
    const payload = {
      order_id: order.id,
      submitted_by: user.id,
      amount,
      currency: order.currency,
      payment_stage: String(form.get('payment_stage') || 'deposit'),
      payment_method: String(form.get('payment_method') || 'bank_transfer'),
      payment_reference: String(form.get('payment_reference') || '').trim() || null,
      payment_date: String(form.get('payment_date') || '') || null,
      notes: String(form.get('notes') || '').trim() || null,
    };
    setMessageBusy((current) => ({ ...current, [order.id]: true }));
    setError('');
    const { error: paymentError } = await supabase.from('order_payment_records').insert(payload);
    setMessageBusy((current) => ({ ...current, [order.id]: false }));
    if (paymentError) { setError(paymentError.message); return; }
    formElement.reset();
    const { data } = await supabase.from('order_payment_records')
      .select('id,order_id,submitted_by,amount,currency,payment_stage,payment_method,payment_reference,payment_date,notes,status,review_note,created_at,reviewed_at')
      .in('order_id', orders.map((item) => item.id)).order('created_at', { ascending: false });
    setPaymentRecords(data || []);
    setMessage('Payment record submitted for administrative review. This does not transfer money.');
  }

  async function saveExportDetails(order, event) {
    event.preventDefault();
    if (!user || !supabase || order.status !== 'confirmed' || !['export','both'].includes(order.coffee_listings?.market)) return;
    const form = new FormData(event.currentTarget);
    const numberOrNull = (value) => String(value || '').trim() === '' ? null : Number(value);
    const moisture = numberOrNull(form.get('moisture_percent'));
    const bagCount = numberOrNull(form.get('bag_count'));
    const bagWeight = numberOrNull(form.get('bag_weight_kg'));
    if (moisture !== null && (!Number.isFinite(moisture) || moisture < 0 || moisture > 100)) { setError('Moisture percentage must be between 0 and 100.'); return; }
    if (bagCount !== null && (!Number.isInteger(bagCount) || bagCount < 0)) { setError('Bag count must be a whole number.'); return; }
    if (bagWeight !== null && (!Number.isFinite(bagWeight) || bagWeight <= 0)) { setError('Bag weight must be greater than zero.'); return; }
    const payload = {
      order_id: order.id,
      destination_country: String(form.get('destination_country') || '').trim(),
      destination_port: String(form.get('destination_port') || '').trim() || null,
      importer_company: String(form.get('importer_company') || '').trim() || null,
      buyer_reference: String(form.get('buyer_reference') || '').trim() || null,
      coffee_variety: String(form.get('coffee_variety') || '').trim() || null,
      grade: String(form.get('grade') || '').trim() || null,
      process: String(form.get('process') || '').trim() || null,
      moisture_percent: moisture,
      crop_year: String(form.get('crop_year') || '').trim() || null,
      lot_reference: String(form.get('lot_reference') || '').trim() || null,
      bag_count: bagCount,
      bag_weight_kg: bagWeight,
      packaging: String(form.get('packaging') || '').trim() || null,
      export_notes: String(form.get('export_notes') || '').trim() || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    if (!payload.destination_country) { setError('Enter the destination country.'); return; }
    const existing = exportDetails.find((row) => row.order_id === order.id);
    setMessageBusy((current) => ({ ...current, [order.id]: true }));
    setError('');
    const result = existing
      ? await supabase.from('order_export_details').update(payload).eq('id', existing.id).select('id').maybeSingle()
      : await supabase.from('order_export_details').insert(payload).select('id').maybeSingle();
    setMessageBusy((current) => ({ ...current, [order.id]: false }));
    if (result.error) { setError(result.error.message); return; }
    if (!result.data) { setError('Export details were not saved. Refresh and try again.'); return; }
    setMessage('Export shipment details saved.');
    await loadAccount(user);
  }

  async function uploadTradeDocument(order, event) {
    event.preventDefault();
    if (!user || !supabase || order.status !== 'confirmed' || !['export','both'].includes(order.coffee_listings?.market)) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get('document_file');
    const documentType = String(form.get('document_type') || '');
    const allowedTypes = ['application/pdf','image/jpeg','image/png'];
    if (!(file instanceof File) || !file.size) { setError('Choose a PDF, JPG or PNG file first.'); return; }
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Upload a PDF, JPG or PNG file no larger than 10 MB.');
      return;
    }
    if (!tradeDocumentTypes.some(([value]) => value === documentType)) { setError('Choose a document type.'); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'trade-document';
    const filePath = order.id + '/' + user.id + '/' + crypto.randomUUID() + '-' + safeName;
    setMessageBusy((current) => ({ ...current, [order.id]: true }));
    setError('');
    const { error: uploadError } = await supabase.storage.from('trade-documents').upload(filePath, file, {
      contentType: file.type, upsert: false,
    });
    if (uploadError) {
      setMessageBusy((current) => ({ ...current, [order.id]: false }));
      setError(uploadError.message);
      return;
    }
    const { error: recordError } = await supabase.from('order_trade_documents').insert({
      order_id: order.id, uploaded_by: user.id, document_type: documentType,
      original_filename: file.name.slice(0,255), file_path: filePath,
    });
    if (recordError) {
      await supabase.storage.from('trade-documents').remove([filePath]);
      setMessageBusy((current) => ({ ...current, [order.id]: false }));
      setError(recordError.message);
      return;
    }
    setMessageBusy((current) => ({ ...current, [order.id]: false }));
    setMessage('Trade document uploaded to private order storage.');
    formElement.reset();
    await loadAccount(user);
  }

  async function openTradeDocument(document) {
    if (!supabase) return;
    setError('');
    const { data, error: urlError } = await supabase.storage.from('trade-documents').createSignedUrl(document.file_path, 60);
    if (urlError) { setError(urlError.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function saveShipment(orderId, event) {
    event.preventDefault();
    if (!user || !supabase) return;
    const form = new FormData(event.currentTarget);
    const existing = orderShipments.find((shipment) => shipment.order_id === orderId);
    const payload = {
      status: String(form.get('status') || 'preparing'),
      carrier: String(form.get('carrier') || '').trim() || null,
      tracking_reference: String(form.get('tracking_reference') || '').trim() || null,
      dispatch_date: String(form.get('dispatch_date') || '') || null,
      estimated_delivery_date: String(form.get('estimated_delivery_date') || '') || null,
      delivery_notes: String(form.get('delivery_notes') || '').trim() || null,
      updated_at: new Date().toISOString(),
    };
    setMessageBusy((current) => ({ ...current, [orderId]: true }));
    setError('');
    const result = existing
      ? await supabase.from('order_shipments').update(payload).eq('id', existing.id).select('id').maybeSingle()
      : await supabase.from('order_shipments').insert({ order_id: orderId, status: 'preparing', carrier: payload.carrier, tracking_reference: payload.tracking_reference, dispatch_date: payload.dispatch_date, estimated_delivery_date: payload.estimated_delivery_date, delivery_notes: payload.delivery_notes }).select('id').maybeSingle();
    setMessageBusy((current) => ({ ...current, [orderId]: false }));
    if (result.error) { setError(result.error.message); return; }
    if (!result.data) { setError('Delivery details were not saved. Check that this is your confirmed order, then refresh.'); return; }
    setMessage('Delivery tracking information saved.');
    await loadAccount(user);
  }

  async function confirmDelivery(shipment) {
    if (!user || !supabase || shipment.status !== 'delivered') return;
    setMessageBusy((current) => ({ ...current, [shipment.order_id]: true }));
    setError('');
    const order = orders.find((item) => item.id === shipment.order_id);
    const { error: confirmError } = await supabase.from('order_delivery_confirmations').insert({
      shipment_id: shipment.id, order_id: shipment.order_id, buyer_id: user.id,
    });
    setMessageBusy((current) => ({ ...current, [shipment.order_id]: false }));
    if (confirmError) { setError(confirmError.code === '23505' ? 'Receipt has already been confirmed.' : confirmError.message); return; }
    if (order) setMessage('Thank you. You confirmed receipt of your coffee order.');
    await loadAccount(user);
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


  async function saveBuyerBusiness(event) {
    event.preventDefault();
    if (!user || role !== 'buyer') return;
    const form = new FormData(event.currentTarget);
    const payload = {
      buyer_id: user.id,
      company_name: String(form.get('company_name') || '').trim() || null,
      country: String(form.get('country') || '').trim() || null,
      city: String(form.get('city') || '').trim() || null,
      business_type: String(form.get('business_type') || 'importer'),
      website: String(form.get('website') || '').trim() || null,
      preferred_origins: String(form.get('preferred_origins') || '').split(',').map((value) => value.trim()).filter(Boolean).slice(0, 10),
      buyer_notes: String(form.get('buyer_notes') || '').trim() || null,
      updated_at: new Date().toISOString(),
    };
    setBusy(true); setError(''); setMessage('');
    const { error: saveError } = await supabase.from('buyer_business_profiles').upsert(payload, { onConflict: 'buyer_id' });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setBuyerBusiness(payload);
    setMessage('International buyer profile saved.');
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
        <section className="account-subsection notification-panel" aria-label="Notifications">
          <div className="admin-block-head"><h3>Notifications</h3><span>{notifications.filter((item) => !item.read_at).length} unread</span></div>
          {notifications.length ? <div className="notification-list">{notifications.map((item) => <article className={'notification-item' + (item.read_at ? ' is-read' : ' is-unread')} key={item.id}>
            <div><b>{item.title}</b><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
            {!item.read_at && <button type="button" className="text-link" onClick={() => markNotificationRead(item.id)}>Mark read</button>}
          </article>)}</div> : <p className="account-hint">No notifications yet. Trade updates and stock alerts will appear here.</p>}
        </section>
        <div className="account-user"><div><span className="account-avatar">{(user.email || 'M').slice(0,1).toUpperCase()}</span><div><b>{user.user_metadata?.full_name || user.email}</b><small>{user.email}</small></div></div><button className="text-link" onClick={signOut} disabled={busy}>Sign out</button></div>
        {role === 'buyer' && <section className="buyer-business-panel">
          <h3 className="account-subhead">International buyer profile</h3>
          <p className="account-hint">Add your company and destination details so suppliers can understand your business when you place an order. This information is shared with a supplier only when you have an order with that supplier.</p>
          <form className="account-form" key={JSON.stringify(buyerBusiness)} onSubmit={saveBuyerBusiness}>
            <label>Company name<input name="company_name" maxLength="160" defaultValue={buyerBusiness.company_name} placeholder="Company / trading name" /></label>
            <div className="form-row">
              <label>Business type<select name="business_type" defaultValue={buyerBusiness.business_type}><option value="importer">Coffee importer</option><option value="roaster">Coffee roaster</option><option value="wholesaler">Wholesaler</option><option value="retailer">Retailer</option><option value="cafe">Cafe</option><option value="other">Other</option></select></label>
              <label>Country<input name="country" maxLength="100" defaultValue={buyerBusiness.country} placeholder="e.g. Japan" /></label>
            </div>
            <div className="form-row"><label>City<input name="city" maxLength="100" defaultValue={buyerBusiness.city} placeholder="City" /></label><label>Website (optional)<input name="website" type="url" maxLength="250" defaultValue={buyerBusiness.website} placeholder="https://example.com" /></label></div>
            <label>Preferred coffee origins<input name="preferred_origins" defaultValue={(buyerBusiness.preferred_origins || []).join(', ')} placeholder="Guji, Sidama, Yirgacheffe" /></label>
            <label>Business notes (optional)<textarea name="buyer_notes" rows="2" maxLength="1200" defaultValue={buyerBusiness.buyer_notes} placeholder="Tell suppliers about your buying interests…" /></label>
            <button className="button button-gold form-submit" disabled={busy}>{busy ? 'Saving…' : 'Save buyer profile'} <span>↗</span></button>
          </form>
        </section>}
        {role === 'admin' ? <div className="supplier-status"><span className="status-dot live" />Account access: <b>Administrator</b></div> : <div className="supplier-status"><span className={approved ? 'status-dot live' : 'status-dot'} />Supplier status: <b>{approved ? 'Approved supplier' : 'Not yet approved'}</b></div>}
        {role !== 'admin' && <section className="verification-panel">
          <h3 className="account-subhead">Business document verification</h3>
          <p className="account-hint">Upload a business registration, trade license, exporter license, cooperative certificate, tax registration or coffee quality certificate. Files are private and visible only to you and authorized MEA BOKO administrators. Do not upload passports or personal identity cards.</p>
          {!supplierApplication ? <p className="admin-empty">Sign in and submit a supplier application to attach business documents to your application.</p> : <>
            <form onSubmit={uploadSupplierVerificationDocument} className="account-form verification-upload-form">
              <label>Document type<select name="document_type" required defaultValue="business_registration"><option value="business_registration">Business registration</option><option value="trade_license">Trade license</option><option value="export_license">Exporter license</option><option value="cooperative_certificate">Cooperative certificate</option><option value="tax_registration">Tax registration</option><option value="coffee_quality_certificate">Coffee quality certificate</option><option value="other_business_document">Other business document</option></select></label>
              <label>Choose file<input name="business_document" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required /></label>
              <button className="button button-gold form-submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload business document'} <span>↗</span></button>
            </form>
            <div className="verification-document-list">
              <h4>Submitted documents</h4>
              {verificationDocs.length ? verificationDocs.map((doc) => <article className="verification-document-row" key={doc.id}><div><b>{doc.document_type.replaceAll('_',' ')}</b><p>{doc.original_file_name}</p><small>{new Date(doc.created_at).toLocaleDateString()}{doc.reviewed_at ? ' · Reviewed ' + new Date(doc.reviewed_at).toLocaleDateString() : ''}</small>{doc.review_note && <p className="account-hint">Review note: {doc.review_note}</p>}</div><span className={'listing-status status-'+doc.status}>{doc.status}</span></article>) : <p className="admin-empty">No business documents uploaded yet.</p>}
            </div>
          </>}
        </section>}
        {role === 'admin' ? <div className="notice account-message">Administrator access is active. Use the Admin Dashboard below to manage supplier applications, coffee listings and buyer inquiries.</div> : !approved ? <div className="notice">To publish coffee products, submit the supplier registration form below while signed in. The MEA BOKO team must approve your application before listing tools are enabled.</div> : <>
          <h3 className="account-subhead">Add a coffee listing</h3>
          <form onSubmit={addListing} className="account-form">
            <label>Product name<input name="name" required placeholder="e.g. Guji Hambela Washed Grade 1" /></label>
            <div className="form-row"><label>Coffee type<select name="product_type" required defaultValue="green_beans"><option value="green_beans">Green coffee beans</option><option value="roasted_beans">Roasted coffee</option><option value="ground_coffee">Ground coffee</option></select></label><label>Market<select name="market" required defaultValue="both"><option value="domestic">Domestic</option><option value="export">International export</option><option value="both">Both markets</option></select></label></div>
            <div className="form-row"><label>Origin<select name="origin_id" defaultValue=""><option value="">Select origin</option>{origins.filter((origin) => origin.origin_level === 'origin').map((origin) => <option key={origin.id} value={origin.id}>{[origins.find((parent) => parent.id === origin.parent_id)?.name, origin.name, origin.region].filter(Boolean).join(' — ')}</option>)}</select></label><label>Process<input name="process" placeholder="Washed / Natural / Honey" /></label></div>
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
          const shipment = orderShipments.find((record) => record.order_id === item.id);
          const receipt = deliveryConfirmations.find((record) => record.order_id === item.id);
          const isExportOrder = ['export','both'].includes(item.coffee_listings?.market);
          const buyerBusinessInfo = buyerBusinessProfiles.find((profile) => profile.buyer_id === item.buyer_id);
          const latestQuote = orderProposals.find((proposal) => proposal.order_id === item.id);
          const orderExportDetails = exportDetails.find((detail) => detail.order_id === item.id);
          const orderDocuments = tradeDocuments.filter((doc) => doc.order_id === item.id);
          const quoteDraft = quoteDrafts[item.id] || {};
          const hasQuoteFields = Object.values(quoteDraft).some((value) => String(value || '').trim());
          return <article className="trade-order-card" key={item.id}>
            <div className="trade-order-head"><div><b>{item.coffee_listings?.name || 'Coffee order'}</b><small>{isBuyer ? 'Buyer view' : 'Supplier view'} · {Number(item.quantity_kg).toLocaleString()} kg · {item.agreed_price === null ? 'Price to be agreed' : Number(item.agreed_price).toLocaleString()+' '+item.currency}</small></div><span className={'listing-status status-'+item.status}>{item.status.replaceAll('_',' ')}</span></div>
            {buyerBusinessInfo && <div className="buyer-order-context">
              <b>{buyerBusinessInfo.company_name || (isBuyer ? 'Your buyer profile' : 'Buyer business profile')}</b>
              <span>{[buyerBusinessInfo.city,buyerBusinessInfo.country].filter(Boolean).join(', ') || 'Business location not provided'}</span>
              <span>{buyerBusinessInfo.business_type.replaceAll('_',' ')}{buyerBusinessInfo.preferred_origins?.length ? ' · Interested in '+buyerBusinessInfo.preferred_origins.join(', ') : ''}</span>
            </div>}
            {isExportOrder && <div className="buyer-export-summary">
              <b>Export order summary</b>
              <span>Destination: {orderExportDetails?.destination_country || 'Not yet provided'}{orderExportDetails?.destination_port ? ' · '+orderExportDetails.destination_port : ''}</span>
              <span>Incoterm: {latestQuote?.incoterm || 'Not yet quoted'} · Shipment: {shipment?.status?.replaceAll('_',' ') || 'Not dispatched'}</span>
              <span>Trade documents: {orderDocuments.length} uploaded</span>
            </div>}
            <div className="order-thread">{thread.length ? thread.map((message) => <div className={message.sender_id === user.id ? 'thread-message own-message' : 'thread-message'} key={message.id}><small>{message.sender_id === user.id ? 'You' : 'Trade partner'} · {new Date(message.created_at).toLocaleString()}</small>{message.body && <p>{message.body}</p>}{message.proposed_price !== null && <strong className="price-proposal">Earlier price note: {Number(message.proposed_price).toLocaleString()} {message.currency} / kg</strong>}</div>) : <p className="account-hint">No messages yet. Start the order discussion below.</p>}</div>
            <div className="price-proposal-list"><b>Price proposals</b>{orderProposals.filter((proposal) => proposal.order_id === item.id).length ? orderProposals.filter((proposal) => proposal.order_id === item.id).map((proposal) => {
              const isRecipient = proposal.proposer_id !== user.id;
              return <div className="price-proposal-card" key={proposal.id}><div><strong>{Number(proposal.amount).toLocaleString()} {proposal.currency} / kg</strong><small>{proposal.proposer_id === user.id ? 'Proposed by you' : 'Proposed by trade partner'} · {new Date(proposal.created_at).toLocaleString()}</small>{proposal.incoterm && <small><b>Delivery term:</b> {proposal.incoterm}{proposal.quote_valid_until ? ' · Valid until '+proposal.quote_valid_until : ''}</small>}{(proposal.freight_per_kg != null || proposal.insurance_per_kg != null || proposal.origin_charges_per_kg != null || proposal.destination_charges_per_kg != null) && <small>Extra per kg — Freight: {proposal.freight_per_kg ?? '—'} · Insurance: {proposal.insurance_per_kg ?? '—'} · Origin: {proposal.origin_charges_per_kg ?? '—'} · Destination: {proposal.destination_charges_per_kg ?? '—'} {proposal.currency}</small>}{proposal.quote_notes && <small>Quote notes: {proposal.quote_notes}</small>}<span className={'listing-status status-'+proposal.status}>{proposal.status}</span></div>{proposal.status === 'pending' && isRecipient && <div className="admin-actions"><button type="button" className="button button-gold" disabled={Boolean(messageBusy[item.id])} onClick={() => respondToPriceProposal(proposal,'accepted')}>Accept price</button><button type="button" className="admin-danger" disabled={Boolean(messageBusy[item.id])} onClick={() => respondToPriceProposal(proposal,'declined')}>Decline</button></div>}</div>;
            }) : <p className="account-hint">No price proposals yet.</p>}</div>
            <section className="order-delivery-panel payment-record-panel">
              <div className="delivery-panel-heading"><b>Payment records</b><span>{paymentRecords.filter((record) => record.order_id === item.id).length} entries</span></div>
              <p className="account-hint">Record a payment made outside MEA BOKO. Submission is not proof of cleared funds; an administrator must review it.</p>
              {paymentRecords.filter((record) => record.order_id === item.id).map((record) => (
                <div className="delivery-details" key={record.id}>
                  <p><strong>{Number(record.amount).toLocaleString()} {record.currency}</strong> · {record.payment_stage.replaceAll('_',' ')} · <span className={'listing-status status-'+record.status}>{record.status}</span></p>
                  <p>{record.payment_method.replaceAll('_',' ')}{record.payment_date ? ' · '+record.payment_date : ''}{record.payment_reference ? ' · Ref: '+record.payment_reference : ''}</p>
                  {record.notes && <p>{record.notes}</p>}
                  {record.review_note && <p>Review note: {record.review_note}</p>}
                  <small>Submitted {new Date(record.created_at).toLocaleString()}</small>
                </div>
              ))}
              {['confirmed','fulfilled'].includes(item.status) && <form className="shipment-form" onSubmit={(event) => submitPaymentRecord(item,event)}>
                <div className="form-row"><label>Amount ({item.currency})<input name="amount" type="number" min="0.01" step="0.01" required placeholder="Payment amount" /></label><label>Payment stage<select name="payment_stage"><option value="deposit">Deposit</option><option value="balance">Balance</option><option value="full_payment">Full payment</option><option value="other">Other</option></select></label></div>
                <div className="form-row"><label>Method<select name="payment_method"><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label>Payment date<input name="payment_date" type="date" /></label></div>
                <label>Payment reference (optional)<input name="payment_reference" maxLength="180" placeholder="Reference from your provider" /></label>
                <label>Notes (optional)<textarea name="notes" rows="2" maxLength="1200" placeholder="Additional information for the reviewer" /></label>
                <button className="button button-dark" disabled={Boolean(messageBusy[item.id])}>{messageBusy[item.id] ? 'Submitting…' : 'Submit payment record'}</button>
              </form>}
            </section>
            {item.status === 'confirmed' && <section className="order-delivery-panel">
              <div className="delivery-panel-heading"><b>Delivery tracking</b>{shipment && <span className={'listing-status status-'+shipment.status}>{shipment.status.replaceAll('_',' ')}</span>}</div>
              {shipment ? <>
                <div className="delivery-details">
                  <p><strong>Carrier:</strong> {shipment.carrier || 'Not specified'}</p>
                  <p><strong>Tracking reference:</strong> {shipment.tracking_reference || 'Not provided'}</p>
                  <p><strong>Dispatch date:</strong> {shipment.dispatch_date || 'Not set'}</p>
                  <p><strong>Estimated delivery:</strong> {shipment.estimated_delivery_date || 'Not set'}</p>
                  {shipment.delivery_notes && <p><strong>Delivery notes:</strong> {shipment.delivery_notes}</p>}
                </div>
                {isBuyer && shipment.status === 'delivered' && !receipt && <button type="button" className="button button-gold" disabled={Boolean(messageBusy[item.id])} onClick={() => confirmDelivery(shipment)}>{messageBusy[item.id] ? 'Saving…' : 'Confirm receipt'}</button>}
                {receipt && <p className="delivery-confirmed">Receipt confirmed by buyer on {new Date(receipt.confirmed_at).toLocaleString()}.</p>}
                {isBuyer && shipment.status === 'delivered' && !receipt && <p className="account-hint">The supplier marked this shipment delivered. Please confirm only after you have received the coffee.</p>}
                {!isBuyer && !receipt && <p className="account-hint">Buyer receipt confirmation is still pending.</p>}
              </> : isBuyer ? <p className="account-hint">The supplier has not added tracking details yet.</p> : <form className="shipment-form" onSubmit={(event) => saveShipment(item.id,event)}>
                <div className="form-row"><label>Delivery status<select name="status" defaultValue="preparing"><option value="preparing">Preparing</option><option value="dispatched">Dispatched</option><option value="in_transit">In transit</option><option value="delivered">Delivered</option></select></label><label>Carrier / logistics partner<input name="carrier" placeholder="Transport company" /></label></div>
                <div className="form-row"><label>Tracking reference<input name="tracking_reference" maxLength="200" placeholder="Waybill / tracking ID" /></label><label>Dispatch date<input name="dispatch_date" type="date" /></label></div>
                <label>Estimated delivery date<input name="estimated_delivery_date" type="date" /></label>
                <label>Delivery notes<textarea name="delivery_notes" rows="2" maxLength="2000" placeholder="Transport, warehouse or delivery information…" /></label>
                <button className="button button-dark" disabled={Boolean(messageBusy[item.id])}>{messageBusy[item.id] ? 'Saving…' : 'Save delivery details'}</button>
              </form>}
              {shipment && !isBuyer && !receipt && shipment.status !== 'delivered' && <form className="shipment-form shipment-update-form" onSubmit={(event) => saveShipment(item.id,event)}>
                <div className="form-row"><label>Update status<select name="status" defaultValue={shipment.status}><option value="preparing">Preparing</option><option value="dispatched">Dispatched</option><option value="in_transit">In transit</option><option value="delivered">Delivered</option></select></label><label>Carrier<input name="carrier" defaultValue={shipment.carrier || ''} placeholder="Transport company" /></label></div>
                <div className="form-row"><label>Tracking reference<input name="tracking_reference" defaultValue={shipment.tracking_reference || ''} maxLength="200" /></label><label>Dispatch date<input name="dispatch_date" type="date" defaultValue={shipment.dispatch_date || ''} /></label></div>
                <label>Estimated delivery date<input name="estimated_delivery_date" type="date" defaultValue={shipment.estimated_delivery_date || ''} /></label>
                <label>Delivery notes<textarea name="delivery_notes" rows="2" maxLength="2000" defaultValue={shipment.delivery_notes || ''} /></label>
                <button className="button button-dark" disabled={Boolean(messageBusy[item.id])}>{messageBusy[item.id] ? 'Saving…' : 'Update delivery tracking'}</button>
              </form>}
            </section>}
            {item.status === 'confirmed' && ['export','both'].includes(item.coffee_listings?.market) && (() => {
              const details = exportDetails.find((row) => row.order_id === item.id);
              const orderDocs = tradeDocuments.filter((doc) => doc.order_id === item.id);
              const checklist = tradeDocumentTypes.map(([value,label]) => ({ value,label,uploaded:orderDocs.some((doc) => doc.document_type === value && doc.status !== 'rejected') }));
              return <section className="export-operations-panel">
                <div className="delivery-panel-heading"><b>Export shipment profile</b><span>{details ? 'Details saved' : 'Details pending'}</span></div>
                <p className="account-hint">Order quantity: <b>{Number(item.quantity_kg).toLocaleString()} kg</b> · Buyer account: {item.buyer_id.slice(0,8).toUpperCase()}</p>
                {details && <div className="export-detail-summary">
                  <p><b>Destination:</b> {details.destination_country}{details.destination_port ? ' · '+details.destination_port : ''}</p>
                  <p><b>Importer:</b> {details.importer_company || 'Not entered'}{details.buyer_reference ? ' · Ref: '+details.buyer_reference : ''}</p>
                  <p><b>Coffee:</b> {[details.coffee_variety,details.grade,details.process].filter(Boolean).join(' · ') || 'Not specified'}</p>
                  <p><b>Quality:</b> {details.moisture_percent != null ? details.moisture_percent+'% moisture' : 'Moisture not recorded'} · Crop year: {details.crop_year || 'Not recorded'}</p>
                  <p><b>Lot:</b> {details.lot_reference || 'Not assigned'} · Bags: {details.bag_count ?? '—'}{details.bag_weight_kg ? ' × '+details.bag_weight_kg+' kg' : ''} · Packaging: {details.packaging || 'Not specified'}</p>
                  {details.export_notes && <p><b>Notes:</b> {details.export_notes}</p>}
                </div>}
                {!isBuyer && <details className="export-details-editor" open={!details}>
                  <summary>{details ? 'Edit export details' : 'Add export details'}</summary>
                  <form className="shipment-form" onSubmit={(event) => saveExportDetails(item,event)}>
                    <div className="form-row"><label>Destination country<input name="destination_country" required maxLength="100" defaultValue={details?.destination_country || ''} placeholder="e.g. Germany" /></label><label>Destination port<input name="destination_port" maxLength="120" defaultValue={details?.destination_port || ''} placeholder="Port / arrival terminal" /></label></div>
                    <div className="form-row"><label>Importer / buyer company<input name="importer_company" maxLength="180" defaultValue={details?.importer_company || ''} placeholder="Company name" /></label><label>Buyer reference<input name="buyer_reference" maxLength="120" defaultValue={details?.buyer_reference || ''} placeholder="Purchase reference" /></label></div>
                    <div className="form-row"><label>Coffee variety<input name="coffee_variety" maxLength="120" defaultValue={details?.coffee_variety || ''} placeholder="Variety / cultivar" /></label><label>Grade<input name="grade" maxLength="80" defaultValue={details?.grade || item.coffee_listings?.grade || ''} placeholder="Grade" /></label></div>
                    <div className="form-row"><label>Processing<input name="process" maxLength="80" defaultValue={details?.process || ''} placeholder="Washed / natural" /></label><label>Moisture (%)<input name="moisture_percent" type="number" min="0" max="100" step="0.01" defaultValue={details?.moisture_percent ?? ''} placeholder="Not tested" /></label></div>
                    <div className="form-row"><label>Crop year<input name="crop_year" maxLength="20" defaultValue={details?.crop_year || ''} placeholder="e.g. 2026/27" /></label><label>Lot reference<input name="lot_reference" maxLength="100" defaultValue={details?.lot_reference || ''} placeholder="Lot / batch ID" /></label></div>
                    <div className="form-row"><label>Bag count<input name="bag_count" type="number" min="0" step="1" defaultValue={details?.bag_count ?? ''} /></label><label>Bag weight (kg)<input name="bag_weight_kg" type="number" min="0.01" step="0.01" defaultValue={details?.bag_weight_kg ?? ''} /></label></div>
                    <label>Packaging<input name="packaging" maxLength="100" defaultValue={details?.packaging || ''} placeholder="Jute / GrainPro / other" /></label>
                    <label>Export notes<textarea name="export_notes" rows="2" maxLength="2000" defaultValue={details?.export_notes || ''} placeholder="Additional lot or buyer instructions…" /></label>
                    <button className="button button-dark" disabled={Boolean(messageBusy[item.id])}>{messageBusy[item.id] ? 'Saving…' : 'Save export profile'}</button>
                  </form>
                </details>}
                <div className="export-checklist">
                  <b>Document record checklist</b>
                  <p className="account-hint">This tracks uploaded files only; it does not determine which documents are legally required.</p>
                  {checklist.map((entry) => <div className="export-check-row" key={entry.value}><span>{entry.label}</span><span className={entry.uploaded ? 'check-present' : 'check-missing'}>{entry.uploaded ? 'Uploaded' : 'Not uploaded'}</span></div>)}
                </div>
              </section>;
            })()}
            {item.status === 'confirmed' && ['export','both'].includes(item.coffee_listings?.market) && <section className="trade-documents-panel">
              <div className="delivery-panel-heading"><b>Export trade documents</b><span>{tradeDocuments.filter((doc) => doc.order_id === item.id).length} uploaded</span></div>
              <p className="account-hint">Upload supporting files for this export order. Files are private and visible only to this order's buyer, supplier and MEA BOKO administrators. Document requirements depend on the destination and current authorities; this checklist is for record management, not a legal clearance decision.</p>
              <div className="trade-document-list">
                {tradeDocuments.filter((doc) => doc.order_id === item.id).map((doc) => <div className="trade-document-row" key={doc.id}>
                  <div><b>{tradeDocumentTypes.find(([value]) => value === doc.document_type)?.[1] || doc.document_type}</b><small>{doc.original_filename} · {new Date(doc.created_at).toLocaleDateString()}</small>{doc.review_note && <small>Review note: {doc.review_note}</small>}</div>
                  <div className="trade-document-actions"><span className={'listing-status status-'+doc.status}>{doc.status.replaceAll('_',' ')}</span><button type="button" className="text-link" onClick={() => openTradeDocument(doc)}>Open file ↗</button></div>
                </div>)}
                {!tradeDocuments.some((doc) => doc.order_id === item.id) && <p className="account-hint">No supporting documents uploaded yet.</p>}
              </div>
              {!isBuyer && <form className="shipment-form trade-document-form" onSubmit={(event) => uploadTradeDocument(item,event)}>
                <div className="form-row"><label>Document type<select name="document_type" required defaultValue=""><option value="" disabled>Select document type</option>{tradeDocumentTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Choose file<input type="file" name="document_file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required /></label></div>
                <button className="button button-dark" disabled={Boolean(messageBusy[item.id])}>{messageBusy[item.id] ? 'Uploading…' : 'Upload trade document'}</button>
              </form>}
            </section>}
            <form className="order-message-form" onSubmit={(event) => sendOrderMessage(item.id, event)}>
              <label>Message<textarea rows="2" maxLength="3000" value={messageDrafts[item.id] || ''} onChange={(event) => setMessageDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Discuss quality, delivery, documents or other order details…" /></label>
              <div className="form-row"><label>Propose price per kg ({item.currency})<input type="number" min="0.01" step="0.01" value={priceDrafts[item.id] || ''} onChange={(event) => setPriceDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Price per kg" /></label><button className="button button-dark" disabled={Boolean(messageBusy[item.id]) || (!String(messageDrafts[item.id] || '').trim() && !String(priceDrafts[item.id] || '').trim() && !hasQuoteFields)}>{messageBusy[item.id] ? 'Sending…' : 'Send message'}</button></div>
            {isExportOrder && <details className="export-quote-editor"><summary>Add international quotation terms</summary><p className="account-hint">Add these details to the price proposal. Both parties can review them before accepting. Use the Incoterm and named place agreed with the trade partner.</p>
              <div className="form-row"><label>Incoterm<select value={quoteDraft.incoterm || ''} onChange={(event) => setQuoteDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), incoterm: event.target.value } }))}><option value="">Select delivery term</option>{['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'].map((term) => <option key={term} value={term}>{term}</option>)}</select></label><label>Quote valid until<input type="date" value={quoteDraft.quote_valid_until || ''} onChange={(event) => setQuoteDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), quote_valid_until: event.target.value } }))} /></label></div>
              <div className="form-row">{[['freight_per_kg','Freight / kg'],['insurance_per_kg','Insurance / kg']].map(([field,label]) => <label key={field}>{label} ({item.currency})<input type="number" min="0" step="0.01" value={quoteDraft[field] || ''} onChange={(event) => setQuoteDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), [field]: event.target.value } }))} /></label>)}</div>
              <div className="form-row">{[['origin_charges_per_kg','Origin charges / kg'],['destination_charges_per_kg','Destination charges / kg']].map(([field,label]) => <label key={field}>{label} ({item.currency})<input type="number" min="0" step="0.01" value={quoteDraft[field] || ''} onChange={(event) => setQuoteDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), [field]: event.target.value } }))} /></label>)}</div>
              <label>Quotation notes<textarea rows="2" maxLength="1500" value={quoteDraft.quote_notes || ''} onChange={(event) => setQuoteDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), quote_notes: event.target.value } }))} placeholder="Named place, scope of included costs, or other quote conditions…" /></label>
            </details>}
            </form>
          </article>;
        })}</div> : <p className="account-hint">You have no buyer or supplier trade orders yet.</p>}
        <h3 className="account-subhead">Your coffee listings</h3>
        {listings.length ? <div className="own-listings">{listings.map((item) => <article className="admin-record" key={item.id}>
          <div className="admin-record-main">
            <div><b>{item.name}</b> <span className={'listing-status status-'+item.status}>{item.status.replaceAll('_',' ')}</span></div>
            <p>{item.product_type.replaceAll('_',' ')} · {item.market}</p>
            <p><b>{item.available_quantity_kg == null ? 'Stock quantity not set' : Number(item.available_quantity_kg).toLocaleString()+' kg available'}</b> · {Number(item.reserved_quantity_kg || 0).toLocaleString()} kg reserved · {Number(item.quantity_kg || 0).toLocaleString()} kg total</p>
            {item.status === 'approved' && item.available_quantity_kg != null && Number(item.available_quantity_kg) <= Number(item.low_stock_threshold_kg || 0) && <p className="account-error" role="status">Low-stock alert: only {Number(item.available_quantity_kg).toLocaleString()} kg available. Threshold: {Number(item.low_stock_threshold_kg || 0).toLocaleString()} kg.</p>}
            {item.status === 'approved' && <form className="account-form" onSubmit={(event) => updateListingInventory(item,event)}>
              <div className="form-row">
                <label>New total stock (kg)<input name="quantity_kg" type="number" min={Number(item.reserved_quantity_kg || 0)} step="0.01" defaultValue={item.quantity_kg ?? ''} required /></label>
                <label>Low-stock alert at (kg)<input name="low_stock_threshold_kg" type="number" min="0" step="0.01" defaultValue={item.low_stock_threshold_kg ?? 50} required /></label>
              </div>
              <button type="submit" disabled={busy}>Update inventory</button>
            </form>}
          </div>
        </article>)}</div> : <p className="account-hint">No coffee listings have been submitted from this account yet.</p>}
        {inventoryHistory.length > 0 && <div className="account-subsection"><h4>Inventory change history</h4>{inventoryHistory.map((entry) => <p key={entry.id} className="account-hint"><b>{entry.coffee_listings?.name || 'Coffee listing'}</b> · {entry.change_type.replaceAll('_',' ')} · {Number(entry.previous_quantity_kg || 0).toLocaleString()} → {Number(entry.new_quantity_kg || 0).toLocaleString()} kg · {new Date(entry.created_at).toLocaleString()}</p>)}</div>}
      </>}
    </div>
  </section>;
}
