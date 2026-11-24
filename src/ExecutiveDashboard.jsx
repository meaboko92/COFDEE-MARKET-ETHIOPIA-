import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';

const words = {
  en: { eyebrow:'EXECUTIVE OVERVIEW', title:'MEA BOKO Coffee Command Center', subtitle:'Live marketplace operations from your existing MEA BOKO database.', refresh:'Refresh data', suppliers:'Supplier applications', listings:'Coffee listings', orders:'Trade orders', inquiries:'Buyer inquiries', payments:'Payment records', exports:'Export destinations', pending:'Pending review', approved:'Approved', active:'Active orders', open:'Open inquiries', recent:'Recent trade orders', noOrders:'No trade orders have been recorded yet.', assistant:'Open MEA BOKO AI assistant', admin:'Administrator access required', login:'Sign in with an administrator account to view this private dashboard.', loading:'Loading live business data…', error:'Some dashboard data could not be loaded.' },
  am: { eyebrow:'የአስተዳደር አጠቃላይ እይታ', title:'MEA BOKO የቡና አስተዳደር ማዕከል', subtitle:'ከነባሩ MEA BOKO ዳታቤዝ የቀጥታ የገበያ መረጃ።', refresh:'መረጃ አድስ', suppliers:'የአቅራቢ ማመልከቻዎች', listings:'የቡና ዝርዝሮች', orders:'የንግድ ትዕዛዞች', inquiries:'የገዢ ጥያቄዎች', payments:'የክፍያ መዝገቦች', exports:'የወጪ መዳረሻዎች', pending:'በግምገማ ላይ', approved:'የጸደቁ', active:'ንቁ ትዕዛዞች', open:'ክፍት ጥያቄዎች', recent:'የቅርብ ጊዜ የንግድ ትዕዛዞች', noOrders:'እስካሁን የንግድ ትዕዛዝ አልተመዘገበም።', assistant:'MEA BOKO AI ረዳትን ክፈት', admin:'የአስተዳዳሪ ፈቃድ ያስፈልጋል', login:'ይህን የግል ዳሽቦርድ ለማየት በአስተዳዳሪ መለያ ይግቡ።', loading:'የንግድ መረጃ በመጫን ላይ…', error:'አንዳንድ የዳሽቦርድ መረጃዎች ሊጫኑ አልቻሉም።' },
  om: { eyebrow:'CUUNFAA WALIGALAA', title:'MEA BOKO Giddugala Bulchiinsa Buna', subtitle:'Odeeffannoo gabaa yeroo ammaa kuusaa MEA BOKO irraa.', refresh:'Odeeffannoo haaromsi', suppliers:'Galmee dhiyeessitootaa', listings:'Tarree bunaa', orders:'Ajaja daldalaa', inquiries:'Gaaffii bittootaa', payments:'Galmee kaffaltii', exports:'Biyyoota ergaa', pending:'Qorannoo eegaa', approved:'Kan mirkanaa’e', active:'Ajaja hojii irra jiru', open:'Gaaffii banaa', recent:'Ajaja daldalaa dhiyoo', noOrders:'Ajajni daldalaa ammaaf hin galmoofne.', assistant:'Gargaaraa AI MEA BOKO bani', admin:'Hayyama bulchaa barbaachisa', login:'Daashboordii dhuunfaa kana ilaaluuf akkaawuntii bulchaa seeni.', loading:'Odeeffannoo daldalaa fe’aa jira…', error:'Odeeffannoon daashboordii tokko tokko hin fe’amne.' }
};

const styles = {
  shell:{margin:'30px auto',padding:'clamp(18px,4vw,42px)',maxWidth:'1260px',background:'#f2f5ef',border:'1px solid #dce5db',borderRadius:'16px',color:'#173b2b'},
  top:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'16px',flexWrap:'wrap'},
  title:{fontSize:'clamp(25px,4vw,38px)',margin:'4px 0 8px',fontFamily:'Georgia,serif'},
  muted:{color:'#68796d',fontSize:'13px',lineHeight:1.6},
  button:{background:'#174632',color:'#fff',border:0,borderRadius:'7px',padding:'11px 15px',fontWeight:700,cursor:'pointer'},
  grid:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'13px',marginTop:'25px'},
  card:{background:'#fff',border:'1px solid #dce5db',borderRadius:'10px',padding:'17px',minWidth:0},
  number:{fontSize:'30px',fontWeight:800,color:'#174632',display:'block',margin:'8px 0 3px'},
  section:{background:'#fff',border:'1px solid #dce5db',borderRadius:'10px',padding:'18px',marginTop:'17px'},
  row:{display:'flex',justifyContent:'space-between',gap:'12px',alignItems:'center',padding:'11px 0',borderBottom:'1px solid #edf1eb',fontSize:'13px'},
  pill:{fontSize:'11px',fontWeight:700,padding:'5px 8px',borderRadius:'20px',background:'#edf4eb',color:'#315d3c'}
};

export default function ExecutiveDashboard() {
  const [language,setLanguage] = useState('en');
  const [user,setUser] = useState(null);
  const [isAdmin,setIsAdmin] = useState(false);
  const [checking,setChecking] = useState(true);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [data,setData] = useState({ suppliers:[], listings:[], orders:[], inquiries:[], payments:[], exports:[] });
  const t = words[language];

  const checkAccess = useCallback(async (sessionUser) => {
    if (!supabase) { setChecking(false); return; }
    let currentUser = sessionUser;
    if (typeof sessionUser === 'undefined') {
      const { data:{ user: fetchedUser } } = await supabase.auth.getUser();
      currentUser = fetchedUser;
    }
    setUser(currentUser || null);
    if (!currentUser) { setIsAdmin(false); setChecking(false); return; }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id',currentUser.id).maybeSingle();
    setIsAdmin(!profileError && profile?.role === 'admin');
    setChecking(false);
  },[]);

  const loadData = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    setLoading(true); setError('');
    const results = await Promise.all([
      supabase.from('supplier_applications').select('id,business_name,status,created_at').order('created_at',{ascending:false}).limit(100),
      supabase.from('coffee_listings').select('id,name,status,market,quantity_kg,available_quantity_kg,currency,created_at').order('created_at',{ascending:false}).limit(100),
      supabase.from('orders').select('id,quantity_kg,agreed_price,currency,status,created_at').order('created_at',{ascending:false}).limit(100),
      supabase.from('inquiries').select('id,status,created_at').order('created_at',{ascending:false}).limit(100),
      supabase.from('order_payment_records').select('id,amount,currency,status,created_at').order('created_at',{ascending:false}).limit(200),
      supabase.from('order_export_details').select('id,order_id,destination_country,updated_at').order('updated_at',{ascending:false}).limit(100)
    ]);
    const names=['suppliers','listings','orders','inquiries','payments','exports'];
    const next={};
    let failed=false;
    results.forEach((result,index)=>{ next[names[index]]=result.data||[]; if(result.error) failed=true; });
    setData(next);
    if(failed) setError(t.error);
    setLoading(false);
  },[isAdmin,t.error]);

  useEffect(()=>{ checkAccess(); const {data:listener}=supabase?.auth.onAuthStateChange((_event,session)=>{checkAccess(session?.user||null);}); return ()=>listener?.subscription?.unsubscribe(); },[checkAccess]);
  useEffect(()=>{ if(isAdmin) loadData(); },[isAdmin,loadData]);

  const stats=useMemo(()=>({
    pendingSuppliers:data.suppliers.filter(x=>['pending','under_review'].includes(x.status)).length,
    approvedSuppliers:data.suppliers.filter(x=>x.status==='approved').length,
    pendingListings:data.listings.filter(x=>x.status==='pending').length,
    approvedListings:data.listings.filter(x=>x.status==='approved').length,
    activeOrders:data.orders.filter(x=>!['fulfilled','cancelled'].includes(x.status)).length,
    openInquiries:data.inquiries.filter(x=>x.status!=='closed').length,
    pendingPayments:data.payments.filter(x=>x.status==='pending').length,
    verifiedPayments:data.payments.filter(x=>x.status==='verified').length
  }),[data]);

  const cards=[
    [t.suppliers,data.suppliers.length,stats.pendingSuppliers+' '+t.pending],
    [t.listings,data.listings.length,stats.pendingListings+' '+t.pending],
    [t.orders,data.orders.length,stats.activeOrders+' '+t.active],
    [t.inquiries,data.inquiries.length,stats.openInquiries+' '+t.open],
    [t.payments,data.payments.length,stats.pendingPayments+' '+t.pending],
    [t.exports,data.exports.length,'Unique destinations']
  ];

  if (!isSupabaseConfigured) return null;
  if (checking) return <section style={styles.shell}><p style={styles.muted}>{t.loading}</p></section>;
  if (!isAdmin) return user ? null : <section style={styles.shell}><b>{t.admin}</b><p style={styles.muted}>{t.login}</p></section>;

  const maxOrder=Math.max(1,...data.orders.map(x=>Number(x.quantity_kg||0)));
  const recentOrders=data.orders.slice(0,6);
  return <section style={styles.shell} id="mea-boko-command-center">
    <div style={styles.top}>
      <div><p style={{...styles.muted,letterSpacing:'.18em',fontWeight:800,color:'#9a7334'}}>{t.eyebrow}</p><h2 style={styles.title}>{t.title}</h2><p style={styles.muted}>{t.subtitle}</p></div>
      <div style={{display:'flex',gap:9,alignItems:'center',flexWrap:'wrap'}}>
        <select aria-label="Dashboard language" value={language} onChange={e=>setLanguage(e.target.value)} style={{padding:'10px',border:'1px solid #dce5db',borderRadius:7,background:'#fff'}}><option value="en">English</option><option value="am">አማርኛ</option><option value="om">Afaan Oromo</option></select>
        <button type="button" style={styles.button} onClick={loadData} disabled={loading}>{loading?'…':t.refresh}</button>
      </div>
    </div>
    {error&&<p role="alert" style={{...styles.muted,color:'#a34c32'}}>{error}</p>}
    <div style={styles.grid}>{cards.map(([label,value,sub])=><article style={styles.card} key={label}><span style={styles.muted}>{label}</span><strong style={styles.number}>{value}</strong><span style={styles.muted}>{sub}</span></article>)}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:15,marginTop:16}}>
      <div style={styles.section}><h3 style={{marginTop:0}}>Supplier & listing approvals</h3>{[[t.pending,stats.pendingSuppliers+stats.pendingListings],[t.approved,stats.approvedSuppliers+stats.approvedListings]].map(([label,value])=><div style={styles.row} key={label}><span>{label}</span><b>{value}</b></div>)}<p style={styles.muted}>Use the detailed administrator controls below to review applications and product listings.</p></div>
      <div style={styles.section}><h3 style={{marginTop:0}}>Payment status</h3>{[[t.pending,stats.pendingPayments],[t.approved,stats.verifiedPayments]].map(([label,value])=><div style={styles.row} key={label}><span>{label}</span><b>{value}</b></div>)}<p style={styles.muted}>Payment status is a database record only. Verify funds independently before approving a payment.</p></div>
    </div>
    <div style={styles.section}><div style={styles.top}><h3 style={{margin:0}}>{t.recent}</h3><span style={styles.pill}>{data.orders.length} loaded · latest 100</span></div>
      {recentOrders.length?recentOrders.map(order=><div style={styles.row} key={order.id}><span><b>{order.id.slice(0,8).toUpperCase()}</b><br/><small style={styles.muted}>{new Date(order.created_at).toLocaleDateString()}</small></span><span>{Number(order.quantity_kg||0).toLocaleString()} kg</span><span style={styles.pill}>{order.status}</span></div>):<p style={styles.muted}>{t.noOrders}</p>}
      {recentOrders.length>0&&<div style={{marginTop:14}}><b style={{fontSize:13}}>Order quantity comparison</b>{recentOrders.map(order=><div key={order.id} style={{display:'grid',gridTemplateColumns:'74px 1fr 65px',gap:9,alignItems:'center',marginTop:9,fontSize:11}}><span>{order.id.slice(0,6)}</span><div style={{height:9,background:'#e8eee6',borderRadius:10,overflow:'hidden'}}><div style={{height:'100%',width:(Number(order.quantity_kg||0)/maxOrder*100)+'%',background:'#39805a',borderRadius:10}}/></div><b>{Number(order.quantity_kg||0).toLocaleString()}kg</b></div>)}</div>}
    </div>
    <div style={{...styles.top,marginTop:17}}><span style={styles.muted}>Dashboard data uses existing MEA BOKO tables; lists are limited for performance. No sample transactions or payments are fabricated.</span><a href="#admin" style={{color:'#174632',fontWeight:700,fontSize:13}}>Open full admin controls ↓</a></div>
  </section>;
}
