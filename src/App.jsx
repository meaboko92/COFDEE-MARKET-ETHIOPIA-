import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import AccountPanel from './AccountPanel';
import AdminPanel from './AdminPanel';
import SupplierListingPanel from './SupplierListingPanel';
import MarketAssistant from './MarketAssistant';

const productLabels = {
  green_beans: 'Green coffee beans',
  roasted_beans: 'Roasted coffee beans',
  ground_coffee: 'Ground coffee',
};

const money = (price, currency) => {
  if (price === null || price === undefined || price === '') return 'Price on request';
  return `${Number(price).toLocaleString()} ${currency || ''}`.trim();
};

export default function App() {
  const [listings, setListings] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [search, setSearch] = useState('');
  const [productType, setProductType] = useState('all');
  const [market, setMarket] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [loading, setLoading] = useState(true);
  const [dbMessage, setDbMessage] = useState(isSupabaseConfigured ? 'Connecting to the coffee market…' : 'Database setup required');
  const [error, setError] = useState('');
  const [selectedListing, setSelectedListing] = useState(null);
  const [modalMode, setModalMode] = useState('inquiry');
  const [orderSent, setOrderSent] = useState(false);
  const [orderMessage, setOrderMessage] = useState('');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [inquirySent, setInquirySent] = useState(false);
  const [supplierSent, setSupplierSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isTelegramApp, setIsTelegramApp] = useState(false);

  useEffect(() => {
    const telegram = window.Telegram?.WebApp;
    if (!telegram) return;
    telegram.ready();
    telegram.expand();
    try {
      telegram.setHeaderColor('#123b2a');
      telegram.setBackgroundColor('#f7f5ef');
    } catch { /* Older Telegram clients may not support these display settings. */ }
    setIsTelegramApp(true);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    async function loadMarket() {
      setLoading(true);
      const [listingResult, originResult, verifiedResult] = await Promise.all([
        supabase.from('coffee_listings')
          .select('id,supplier_id,name,product_type,market,process,grade,tasting_notes,description,quantity_kg,reserved_quantity_kg,available_quantity_kg,price,currency,origin_id,photo_url,origins(name,region)')
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),
        supabase.from('origins').select('id,name,region,description').order('name'),
        supabase.from('supplier_business_verifications').select('user_id'),
      ]);
      if (!active) return;
      if (listingResult.error) {
        setError(listingResult.error.message);
        setDbMessage('Could not load marketplace listings');
      } else {
        const verifiedSupplierIds = new Set((verifiedResult.data || []).map((row) => row.user_id));
        setListings((listingResult.data || []).map((listing) => ({
          ...listing,
          supplierVerified: Boolean(listing.supplier_id && verifiedSupplierIds.has(listing.supplier_id)),
        })));
        setDbMessage('Connected to MEA BOKO marketplace');
      }
      if (!originResult.error) setOrigins(originResult.data || []);
      setLoading(false);
    }
    loadMarket();
    return () => { active = false; };
  }, []);

  const filteredListings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return listings.filter((item) => {
      const originName = item.origins?.name || '';
      const matchesSearch = !term || [item.name, item.description, item.tasting_notes, item.process, item.grade, originName]
        .some((value) => String(value || '').toLowerCase().includes(term));
      const matchesType = productType === 'all' || item.product_type === productType;
      const matchesMarket = market === 'all' || item.market === market || item.market === 'both';
      const matchesOrigin = origin === 'all' || item.origin_id === origin;
      return matchesSearch && matchesType && matchesMarket && matchesOrigin;
    });
  }, [listings, search, productType, market, origin]);

  async function submitInquiry(event) {
    event.preventDefault();
    if (!supabase || !selectedListing) return;
    setBusy(true);
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const { error: submitError } = await supabase.from('inquiries').insert({
      listing_id: selectedListing.id,
      sender_id: null,
      name: String(form.get('name') || '').trim(),
      email: String(form.get('email') || '').trim(),
      phone: String(form.get('phone') || '').trim() || null,
      message: String(form.get('message') || '').trim(),
      status: 'new',
    });
    setBusy(false);
    if (submitError) {
      setError(submitError.message);
      return;
    }
    setInquirySent(true);
    setInquiryMessage('Your inquiry has been submitted. The MEA BOKO team can follow up using the contact details you provided.');
    formElement.reset();
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!supabase || !selectedListing) return;
    setBusy(true);
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setBusy(false);
      setError('Please sign in to your MEA BOKO account before requesting an order.');
      return;
    }
    const quantity = Number(form.get('quantity_kg'));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setBusy(false);
      setError('Enter a quantity greater than zero.');
      return;
    }
    const { error: orderError } = await supabase.from('orders').insert({
      buyer_id: user.id,
      listing_id: selectedListing.id,
      quantity_kg: quantity,
      currency: String(form.get('currency') || 'ETB'),
    });
    setBusy(false);
    if (orderError) {
      setError(orderError.message);
      return;
    }
    setOrderSent(true);
    setOrderMessage('Your order request has been created. Sign in to your account to message the supplier and discuss your price. No payment has been taken.');
    formElement.reset();
  }

  async function submitSupplier(event) {
    event.preventDefault();
    if (!supabase) {
      setError('The MEA BOKO database is not connected. Please try again later.');
      return;
    }
    setBusy(true);
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setBusy(false);
      setError('Please sign in to your MEA BOKO account before submitting a supplier application. This lets you track your application and upload business documents.');
      document.getElementById('account')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const { data: existingApplication, error: lookupError } = await supabase
      .from('supplier_applications')
      .select('id,status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'under_review'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      setBusy(false);
      setError(lookupError.message);
      return;
    }
    if (existingApplication) {
      setBusy(false);
      setSupplierSent(true);
      setError('');
      window.dispatchEvent(new CustomEvent('mea-boko-supplier-application-updated'));
      return;
    }

    const { error: submitError } = await supabase.from('supplier_applications').insert({
      user_id: user.id,
      contact_person: String(form.get('contact_person') || '').trim(),
      business_name: String(form.get('business_name') || '').trim(),
      email: String(form.get('email') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      business_role: String(form.get('business_role') || ''),
      market_interest: String(form.get('market_interest') || ''),
      coffee_details: String(form.get('coffee_details') || '').trim() || null,
      status: 'pending',
    });
    setBusy(false);
    if (submitError) {
      setError(submitError.message);
      return;
    }
    setSupplierSent(true);
    formElement.reset();
    window.dispatchEvent(new CustomEvent('mea-boko-supplier-application-updated'));
  }

  return (
    <main className="site-shell">
      <div className="announcement">ETHIOPIAN COFFEE · DOMESTIC & INTERNATIONAL MARKET</div>
      {isTelegramApp && <div className="announcement" role="status">TELEGRAM MINI APP · MEA BOKO MARKETPLACE</div>}
      <header className="topbar">
        <a className="brand" href="#home" aria-label="MEA BOKO home"><span className="brand-mark">MB</span><span><b>MEA BOKO</b><small>COFFEE ETHIOPIA</small></span></a>
        <nav><a href="#about">About us</a><a href="#marketplace">Marketplace</a><a href="#origins">Origins</a><a href="#suppliers">For suppliers</a></nav>
        <a className="nav-cta" href="#suppliers">Join the market <span>↗</span></a>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <p className="eyebrow">FROM ETHIOPIA, TO THE WORLD</p>
          <h1>Great coffee.<br /><em>Closer connections.</em></h1>
          <p className="hero-intro">MEA BOKO connects Ethiopian coffee farmers, producers, suppliers, brokers, exporters and buyers — serving domestic trade and international markets across Ethiopia’s diverse coffee-growing regions.</p>
          <div className="hero-actions"><a className="button button-gold" href="#marketplace">Explore coffee <span>↓</span></a><a className="text-link" href="#suppliers">Become a supplier <span>↗</span></a></div>
          <div className="hero-proof"><span>OROMIA</span><i /> <span>SIDAMA</span><i /> <span>GEDEO</span><i /> <span>AND MORE</span></div>
        </div>
        <div className="hero-art" aria-label="Ethiopian coffee beans and coffee leaves">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="coffee-stamp"><span>MB</span><small>ETHIOPIAN<br />COFFEE</small></div>
          <div className="bean bean-one" /><div className="bean bean-two" /><div className="bean bean-three" />
          <div className="art-caption">ORIGIN<br /><b>ETHIOPIA</b></div>
        </div>
      </section>

      <section className="market-strip">
        <div><strong>01</strong><span>Green coffee<br />& roasted coffee</span></div>
        <div><strong>02</strong><span>Domestic<br />& export market</span></div>
        <div><strong>03</strong><span>Origin-led<br />coffee discovery</span></div>
        <div><strong>04</strong><span>Direct trade<br />connections</span></div>
      </section>

      <section className="about-section section-wrap" id="about">
        <div className="section-head"><div><p className="eyebrow">WHO WE ARE</p><h2>One Ethiopian coffee marketplace. Many origins.</h2><p>MEA BOKO Coffee Ethiopia is a marketplace and trade-connection platform built to connect coffee-growing communities with buyers in Ethiopia and around the world.</p></div></div>
        <div className="about-copy">
          <p>We support coffee discovery, sourcing, buying and selling, supplier connections, brokering and commercial intermediation. Our aim is to make it easier for farmers, cooperatives, suppliers, exporters, roasters and buyers to find one another and discuss trade opportunities.</p>
          <p>Our sourcing network is open to coffee-producing areas across Ethiopia, including Oromia, Sidama, South Ethiopia, Southwest Ethiopia Peoples’ Region and other producing regions. Specific coffee origins and lots are identified by their actual production area, processing method, grade and available documentation.</p>
          <div className="about-region-grid">
            <article><b>OROMIA</b><span>Guji, Jimma, Limu, Illubabor and other producing areas</span></article>
            <article><b>SIDAMA</b><span>Sidama coffee-growing communities and washing stations</span></article>
            <article><b>SOUTH ETHIOPIA</b><span>Gedeo, including Yirgacheffe and nearby coffee areas</span></article>
            <article><b>SOUTHWEST & OTHER REGIONS</b><span>Kaffa, Bench Sheko and other Ethiopian coffee-producing areas</span></article>
          </div>
          <p className="about-note">Region names describe broad sourcing coverage. Availability, origin, grade, process, quantity and export readiness are confirmed for each individual coffee listing.</p>
        </div>
      </section>

      <section className="featured-coffee section-wrap" id="featured-coffee">
        <div className="section-head">
          <div><p className="eyebrow">A TASTE OF ETHIOPIA</p><h2>Featured coffee origins</h2><p>Explore the places behind Ethiopia’s celebrated coffee character. These are origin highlights, not live stock offers.</p></div>
          <a className="text-link" href="#marketplace">View available listings <span>↗</span></a>
        </div>
        <div className="featured-coffee-grid">
          <article className="featured-coffee-card">
            <img src="https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1000&q=85" alt="Freshly roasted coffee beans" loading="lazy" />
            <div className="featured-coffee-shade"></div><span className="featured-origin-tag">OROMIA</span>
            <div className="featured-coffee-copy"><p>HIGHLAND CHARACTER</p><h3>Guji</h3><span>Explore coffees from Guji’s distinctive growing communities.</span><a href="#marketplace">Explore listings ↗</a></div>
          </article>
          <article className="featured-coffee-card">
            <img src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1000&q=85" alt="Coffee being prepared in a cup" loading="lazy" />
            <div className="featured-coffee-shade"></div><span className="featured-origin-tag">SIDAMA</span>
            <div className="featured-coffee-copy"><p>ORIGIN & PROCESS</p><h3>Sidama</h3><span>Discover coffee from Sidama’s producing communities.</span><a href="#marketplace">Explore listings ↗</a></div>
          </article>
          <article className="featured-coffee-card">
            <img src="https://images.unsplash.com/photo-1511537190424-bbbab87ac5eb?auto=format&fit=crop&w=1000&q=85" alt="Coffee cherries and coffee beans" loading="lazy" />
            <div className="featured-coffee-shade"></div><span className="featured-origin-tag">GEDEO</span>
            <div className="featured-coffee-copy"><p>COFFEE HERITAGE</p><h3>Yirgacheffe</h3><span>Explore Yirgacheffe and nearby Gedeo coffee areas.</span><a href="#marketplace">Explore listings ↗</a></div>
          </article>
        </div>
        <p className="featured-coffee-note">Actual availability, processing method, grade, quantity and price are shown on individual marketplace listings.</p>
      </section>

      <section className="marketplace section-wrap" id="marketplace">
        <div className="section-head">
          <div><p className="eyebrow">THE COFFEE MARKET</p><h2>Explore available coffee</h2><p>Find products by type, market and Ethiopian origin.</p></div>
          <div className="market-status"><span className={dbMessage.startsWith('Connected') ? 'status-dot live' : 'status-dot'} />{dbMessage}</div>
        </div>
        <div className="filters">
          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search coffee, origin, process…" /></label>
          <select aria-label="Coffee type" value={productType} onChange={(event) => setProductType(event.target.value)}><option value="all">All coffee types</option><option value="green_beans">Green coffee beans</option><option value="roasted_beans">Roasted coffee</option><option value="ground_coffee">Ground coffee</option></select>
          <select aria-label="Market" value={market} onChange={(event) => setMarket(event.target.value)}><option value="all">All markets</option><option value="domestic">Domestic</option><option value="export">International export</option></select>
          <select aria-label="Coffee origin" value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="all">All origins</option>{origins.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        </div>
        {error && <div className="notice error-notice">{error}</div>}
        {loading ? <div className="empty-market">Loading coffee listings…</div> : filteredListings.length ? (
          <div className="product-grid">{filteredListings.map((item) => (
            <article className="product-card" key={item.id}>
              <div className="product-visual">{item.photo_url ? <img className="product-photo" src={item.photo_url} alt={`${item.name} coffee product`} loading="lazy" /> : <div className="product-photo-placeholder"><span className="product-chip">{productLabels[item.product_type] || item.product_type}</span><div className="product-bean">✦</div></div>}<span className="product-origin">{item.origins?.name || 'Ethiopia'}</span></div>
              <div className="product-info"><div className="product-meta"><span>{item.origins?.region || 'Ethiopia'}</span><span>{item.market === 'both' ? 'Domestic + Export' : item.market}</span>{item.supplierVerified && <span className="verified-badge">✓ Business verified</span>}</div><h3>{item.name}</h3><p>{[item.process, item.grade].filter(Boolean).join(' · ') || 'Ethiopian coffee'}</p>{item.tasting_notes && <p className="tasting-notes">{item.tasting_notes}</p>}<div className="product-bottom"><div><strong>{money(item.price, item.currency)}</strong>{item.available_quantity_kg !== null && <small>{Number(item.available_quantity_kg).toLocaleString()} kg available</small>}</div><div className="product-actions"><button className="button button-dark" onClick={() => { setSelectedListing(item); setModalMode('inquiry'); setInquirySent(false); setOrderSent(false); setInquiryMessage(''); setError(''); }}>Inquire <span>↗</span></button><button className="button button-gold" onClick={() => { setSelectedListing(item); setModalMode('order'); setOrderSent(false); setInquirySent(false); setError(''); }}>Request order <span>↗</span></button></div></div></div>
            </article>
          ))}</div>
        ) : <div className="empty-market"><span className="empty-icon">✳</span><h3>{listings.length ? 'No matching coffee found' : 'New coffee listings are coming soon'}</h3><p>{listings.length ? 'Try changing your search or filters.' : 'Approved supplier listings will appear here. Suppliers can apply to join the marketplace below.'}</p><a href="#suppliers" className="text-link">Become a supplier <span>↗</span></a></div>}
      </section>

      <section className="origins-section section-wrap" id="origins">
        <div className="section-head"><div><p className="eyebrow">THE PLACES BEHIND THE FLAVOR</p><h2>Explore Ethiopian origins</h2><p>Discover the coffee-growing regions represented in our marketplace.</p></div></div>
        <div className="origin-grid">{(origins.length ? origins : [{name:'Guji',region:'Oromia'},{name:'Sidama',region:'Sidama'},{name:'Yirgacheffe',region:'Gedeo'}]).map((item, index) => <article className={`origin-card origin-${index % 3}`} key={item.id || item.name}><span className="origin-number">0{index + 1}</span><div><h3>{item.name}</h3><p>{item.region}</p>{item.description && <small>{item.description}</small>}</div><span className="origin-arrow">↗</span></article>)}</div>
      </section>

      <AccountPanel />
      <SupplierListingPanel origins={origins} />
      <AdminPanel />

      <section className="supplier-section" id="suppliers">
        <div className="supplier-copy"><p className="eyebrow">GROW WITH MEA BOKO</p><h2>Bring your coffee<br />to a wider market.</h2><p>Are you a farmer, producer, cooperative, supplier, broker, exporter, roaster or coffee business in any Ethiopian coffee-producing region? Apply to connect with domestic and international buyers.</p><div className="supplier-points"><span>✓ Domestic & export interest</span><span>✓ Green and roasted coffee</span><span>✓ Ethiopian coffee origins</span></div></div>
        <form className="supplier-form" onSubmit={submitSupplier}>
          <h3>Supplier registration</h3><p>Send your business details for review.</p>
          {supplierSent ? <div className="success-panel"><span>✓</span><b>Application received</b><p>Thank you. Your supplier application has been submitted for review.</p><button type="button" className="text-link" onClick={() => setSupplierSent(false)}>Submit another application</button></div> : !isSupabaseConfigured ? <div className="notice">Connect the Supabase project to submit an application.</div> : <>
            <div className="form-row"><label>Contact person<input name="contact_person" required placeholder="Your full name" /></label><label>Business name<input name="business_name" required placeholder="Company or farm name" /></label></div>
            <div className="form-row"><label>Email address<input name="email" type="email" required placeholder="name@example.com" /></label><label>Phone / WhatsApp<input name="phone" required placeholder="+251…" /></label></div>
            <div className="form-row"><label>Business role<select name="business_role" required defaultValue=""><option value="" disabled>Select role</option><option>Producer / Farmer</option><option>Supplier / Cooperative</option><option>Exporter</option><option>Roaster</option><option>Importer / Buyer</option><option>Other</option></select></label><label>Market interest<select name="market_interest" required defaultValue=""><option value="" disabled>Select market</option><option>Domestic</option><option>International export</option><option>Both domestic and export</option></select></label></div>
            <label>Coffee details<textarea name="coffee_details" rows="3" placeholder="Origin, coffee type, process, grade and estimated quantity…" /></label>
            <button className="button button-gold form-submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit supplier application'} <span>↗</span></button>
          </>}
        </form>
      </section>

      <MarketAssistant />

      <footer className="footer"><a className="brand footer-brand" href="#home"><span className="brand-mark">MB</span><span><b>MEA BOKO</b><small>COFFEE ETHIOPIA</small></span></a><p>Connecting coffee farmers, suppliers and buyers across Oromia, Sidama, Gedeo and coffee-producing regions throughout Ethiopia.</p><span>© {new Date().getFullYear()} MEA BOKO</span></footer>

      {selectedListing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedListing(null); }}><section className="inquiry-modal" role="dialog" aria-modal="true" aria-labelledby="inquiry-title"><button className="modal-close" onClick={() => setSelectedListing(null)} aria-label="Close">×</button>{orderSent ? <div className="success-panel"><span>✓</span><h2>Order request received</h2><p>{orderMessage}</p><button className="button button-dark" onClick={() => setSelectedListing(null)}>Close</button></div> : inquirySent ? <div className="success-panel"><span>✓</span><h2>Inquiry sent</h2><p>{inquiryMessage}</p><button className="button button-dark" onClick={() => setSelectedListing(null)}>Close</button></div> : <><p className="eyebrow">CONNECT WITH THE MARKET</p><h2 id="inquiry-title">{modalMode === 'order' ? 'Request ' + selectedListing.name : 'Ask about ' + selectedListing.name}</h2><p className="modal-subtitle">{selectedListing.origins?.name || 'Ethiopia'} · {money(selectedListing.price, selectedListing.currency)}</p>{error && <div className="notice error-notice">{error}</div>}{!isSupabaseConfigured ? <div className="notice">Connect Supabase to continue.</div> : modalMode === 'order' ? <form onSubmit={submitOrder}><p className="modal-subtitle">Sign in first. Your request will be sent to the MEA BOKO team; payment is not collected here.</p><label>Requested quantity (kg)<input name="quantity_kg" type="number" min="0.01" step="0.01" max={selectedListing.available_quantity_kg ?? undefined} required placeholder="Enter requested kilograms" /></label>{selectedListing.available_quantity_kg !== null && <p className="account-hint">Currently available: {Number(selectedListing.available_quantity_kg).toLocaleString()} kg. Stock is reserved only after the price proposal is accepted.</p>}<label>Currency<select name="currency" defaultValue={selectedListing.currency || 'ETB'}><option value="ETB">ETB</option><option value="USD">USD</option></select></label><button className="button button-dark form-submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit order request'} <span>↗</span></button></form> : <form onSubmit={submitInquiry}><label>Your name<input name="name" required placeholder="Full name" /></label><label>Email address<input name="email" type="email" required placeholder="name@example.com" /></label><label>Phone / WhatsApp<input name="phone" placeholder="+251…" /></label><label>Your message<textarea name="message" rows="4" required placeholder="Tell us what quantity you are interested in and your destination market…" /></label><button className="button button-dark form-submit" disabled={busy}>{busy ? 'Sending…' : 'Send inquiry'} <span>↗</span></button></form>}</>}</section></div>}
    </main>
  );
}
