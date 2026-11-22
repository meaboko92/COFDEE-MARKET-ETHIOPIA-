import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

export default function App() {
  const [origins, setOrigins] = useState([]);
  const [status, setStatus] = useState(isSupabaseConfigured ? 'Connecting to Supabase…' : 'Supabase setup required');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    async function loadOrigins() {
      const { data, error: queryError } = await supabase
        .from('origins')
        .select('id, name, region, description')
        .order('name');
      if (!active) return;
      if (queryError) {
        setError(queryError.message);
        setStatus('Could not load coffee origins');
        return;
      }
      setOrigins(data ?? []);
      setStatus('Connected to MEA BOKO database');
    }
    loadOrigins();
    return () => { active = false; };
  }, []);

  return (
    <main className="page-shell">
      <header className="topbar"><div className="brand-mark">MB</div><div><p className="eyebrow">ETHIOPIAN COFFEE MARKETPLACE</p><h1>MEA BOKO COFFEE ETHIOPIA</h1></div></header>
      <section className="hero">
        <p className="eyebrow">FROM ETHIOPIA TO THE WORLD</p>
        <h2>Discover Ethiopian coffee.<br />Connect with the market.</h2>
        <p className="intro">A marketplace foundation for green beans, roasted coffee, suppliers, exporters, importers and buyers.</p>
        <div className="status-line"><span className={status.startsWith('Connected') ? 'dot online' : 'dot'} />{status}</div>
        {error && <p className="error-message">{error}</p>}
        {!isSupabaseConfigured && <p className="setup-note">Add your Supabase URL and public anon key to a local <code>.env</code> file. See the repository README for setup steps.</p>}
      </section>
      <section className="origins-section"><div className="section-heading"><div><p className="eyebrow">COFFEE REGIONS</p><h2>Explore origins</h2></div><span className="count">{origins.length} regions</span></div>
        {origins.length ? <div className="origin-grid">{origins.map(origin => <article className="origin-card" key={origin.id}><span className="coffee-icon">✦</span><h3>{origin.name}</h3><p>{origin.region}</p>{origin.description && <small>{origin.description}</small>}</article>)}</div> : <div className="empty-state">{isSupabaseConfigured ? 'Coffee origins will appear here when the database responds.' : 'Your coffee origins will appear here after Supabase is configured.'}</div>}
      </section>
      <footer>MEA BOKO · Ethiopian Coffee · Domestic & International Trade</footer>
    </main>
  );
}
