import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function SupplierListingPanel({ origins = [] }) {
  const [user, setUser] = useState(null);
  const [approved, setApproved] = useState(false);
  const [checking, setChecking] = useState(true);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    let mounted = true;
    async function checkSupplier(sessionUser) {
      setChecking(true);
      let currentUser = sessionUser;
      if (typeof sessionUser === 'undefined') {
        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user;
      }
      if (!mounted) return;
      setUser(currentUser || null);
      if (currentUser) {
        const [applicationResult, verificationResult] = await Promise.all([
          supabase.from('supplier_applications')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle(),
          supabase.from('verified_suppliers')
            .select('user_id')
            .eq('user_id', currentUser.id)
            .maybeSingle(),
        ]);
        if (!mounted) return;
        setApproved(Boolean(applicationResult.data && verificationResult.data) &&
          !applicationResult.error && !verificationResult.error);
      } else {
        setApproved(false);
      }
      setChecking(false);
    }
    checkSupplier();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Use the session supplied by the auth event; do not call Supabase auth again
      // from inside its own state-change callback.
      checkSupplier(session?.user || null);
    });
    const refresh = () => checkSupplier();
    window.addEventListener('mea-boko-supplier-application-updated', refresh);
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.removeEventListener('mea-boko-supplier-application-updated', refresh);
    };
  }, []);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function choosePhoto(event) {
    const selected = event.target.files?.[0] || null;
    setError('');
    setMessage('');
    if (!selected) { setFile(null); return; }
    if (!ALLOWED_IMAGE_TYPES.includes(selected.type)) {
      setFile(null);
      event.target.value = '';
      setError('Choose a JPG, PNG or WEBP image.');
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setFile(null);
      event.target.value = '';
      setError('The photo must be 5 MB or smaller.');
      return;
    }
    setFile(selected);
  }

  async function submitListing(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!supabase || !user) { setError('Please sign in before submitting a coffee listing.'); return; }
    if (!approved) { setError('Your supplier application and business verification must both be approved before you can submit coffee products.'); return; }
    if (!file) { setError('Please add at least one coffee product photo.'); return; }

    const formElement = event.currentTarget;
    setBusy(true);
    let uploadedPath = '';
    try {
      const form = new FormData(formElement);
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const unique = globalThis.crypto?.randomUUID?.() || String(Date.now());
      uploadedPath = `${user.id}/${unique}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('coffee-product-photos')
        .upload(uploadedPath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('coffee-product-photos').getPublicUrl(uploadedPath);
      const { error: insertError } = await supabase.from('coffee_listings').insert({
        supplier_id: user.id,
        name: String(form.get('name') || '').trim(),
        product_type: String(form.get('product_type') || 'green_beans'),
        market: String(form.get('market') || 'both'),
        process: String(form.get('process') || '').trim() || null,
        grade: String(form.get('grade') || '').trim() || null,
        description: String(form.get('description') || '').trim() || null,
        quantity_kg: Number(form.get('quantity_kg') || 0),
        price: form.get('price') ? Number(form.get('price')) : null,
        currency: String(form.get('currency') || 'ETB'),
        origin_id: String(form.get('origin_id') || '') || null,
        photo_url: publicData.publicUrl,
        photo_path: uploadedPath,
        status: 'pending',
      });
      if (insertError) throw insertError;
      setMessage('Coffee listing submitted with its photo. It will appear in the marketplace after administrator approval.');
      setFile(null);
      formElement.reset();
    } catch (submitError) {
      if (uploadedPath) await supabase.storage.from('coffee-product-photos').remove([uploadedPath]);
      setError(submitError.message || 'Could not submit this coffee listing.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="supplier-listing-section section-wrap" id="add-coffee">
      <div className="section-head"><div><p className="eyebrow">SUPPLIER PRODUCT UPLOAD</p><h2>Add coffee with a real product photo</h2><p>Approved suppliers can upload a coffee image and submit product details for review.</p></div></div>
      {!isSupabaseConfigured ? <div className="notice">The MEA BOKO database is not configured.</div>
        : checking ? <p className="account-hint">Checking supplier access…</p>
        : !user ? <div className="notice">Sign in to your MEA BOKO account to submit a coffee product.</div>
        : !approved ? <div className="notice">Your supplier application and business verification must both be approved before product listing is enabled. You can still submit your supplier application and verification documents below.</div>
        : <form className="supplier-product-form" onSubmit={submitListing}>
          <div className="form-row">
            <label>Product name<input name="name" required maxLength="120" placeholder="e.g. Guji Hambela Grade 1" /></label>
            <label>Coffee origin<select name="origin_id" defaultValue=""><option value="">Select origin</option>{origins.filter((item) => item.origin_level === 'origin').map((item) => <option key={item.id} value={item.id}>{[origins.find((parent) => parent.id === item.parent_id)?.name, item.name, item.region || 'Ethiopia'].filter(Boolean).join(' — ')}</option>)}</select></label>
          </div>
          <div className="form-row">
            <label>Product type<select name="product_type" defaultValue="green_beans"><option value="green_beans">Green coffee beans</option><option value="roasted_beans">Roasted coffee beans</option><option value="ground_coffee">Ground coffee</option></select></label>
            <label>Processing method<select name="process" defaultValue=""><option value="">Select process</option><option>Washed</option><option>Natural</option><option>Honey</option><option>Other</option></select></label>
          </div>
          <div className="form-row">
            <label>Market<select name="market" defaultValue="both"><option value="both">Domestic and export</option><option value="domestic">Domestic</option><option value="export">Export</option></select></label>
            <label>Grade<input name="grade" placeholder="e.g. Grade 1" /></label>
          </div>
          <div className="form-row">
            <label>Quantity (kg)<input name="quantity_kg" type="number" min="0.01" step="0.01" required placeholder="Available quantity" /></label>
            <label>Price per kg<input name="price" type="number" min="0" step="0.01" placeholder="Optional" /></label>
            <label>Currency<select name="currency" defaultValue="ETB"><option>ETB</option><option>USD</option><option>EUR</option></select></label>
          </div>
          <label>Product description<textarea name="description" rows="3" placeholder="Variety, harvest year, tasting notes, packaging and other details…" /></label>
          <label className="coffee-photo-picker">Coffee product photo
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} required />
            <small>JPG, PNG or WEBP · Maximum 5 MB · Use a genuine photo of this coffee lot.</small>
          </label>
          {preview && <div className="coffee-photo-preview"><img src={preview} alt="Selected coffee product preview" /><span>Photo preview</span></div>}
          {error && <div className="notice error-notice" role="alert">{error}</div>}
          {message && <div className="notice account-message" role="status">{message}</div>}
          <button className="button button-gold form-submit" disabled={busy}>{busy ? 'Uploading and submitting…' : 'Upload photo & submit listing'} <span>↗</span></button>
        </form>}
    </section>
  );
}
