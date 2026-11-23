import { useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

const copy = {
  en: {
    title: 'MEA BOKO Market Assistant',
    subtitle: 'Coffee marketplace help',
    welcome: 'Hello! I can guide you around the MEA BOKO coffee marketplace. Choose a topic below.',
    placeholder: 'Ask about coffee, buying or selling…',
    send: 'Send',
    prompts: ['How do I become a supplier?', 'How can I find Ethiopian coffee?', 'How do I contact the market team?'],
    answers: [
      'To apply as a supplier, create or sign in to your MEA BOKO account, open “For suppliers”, complete the supplier registration form and submit it for review. Approval is subject to business verification.',
      'Open Marketplace and use the search and filters to explore approved coffee listings by product type, market and origin. New listings appear after supplier and listing review.',
      'For assistance, use the contact details published on the MEA BOKO website or send a message through the relevant marketplace inquiry form.'
    ],
    fallback: 'I can help with coffee marketplace questions. For account-specific issues, please contact the MEA BOKO team.',
    signIn: 'Please sign in to your MEA BOKO account to use the AI assistant.',
    failed: 'The AI assistant is not ready yet. Please try again later or contact support.',
    thinking: 'Thinking…'
  },
  am: {
    title: 'የMEA BOKO የገበያ ረዳት',
    subtitle: 'ስለ ቡና ገበያ እገዛ',
    welcome: 'ሰላም! በMEA BOKO የቡና ገበያ ላይ እመራዎታለሁ። ከታች ያለውን ርዕስ ይምረጡ።',
    placeholder: 'ስለ ቡና፣ ግዢ ወይም ሽያጭ ይጠይቁ…',
    send: 'ላክ',
    prompts: ['አቅራቢ እንዴት እሆናለሁ?', 'የኢትዮጵያ ቡና እንዴት አገኛለሁ?', 'የገበያውን ቡድን እንዴት አገኛለሁ?'],
    answers: [
      'አቅራቢ ለመሆን ወደ MEA BOKO መለያዎ ይግቡ፣ “For suppliers” ይክፈቱ፣ የአቅራቢ ምዝገባ ቅጹን ይሙሉና ለግምገማ ያስገቡ። ማጽደቅ በንግድ ማረጋገጫ ላይ ይመረኮዛል።',
      'በMarketplace ውስጥ የፍለጋና ማጣሪያ መሳሪያዎችን በመጠቀም በቡና አይነት፣ ገበያና አመጣጥ ይፈልጉ።',
      'እገዛ ለማግኘት በMEA BOKO ድረ-ገጽ ላይ የታተሙትን የመገኛ መረጃዎች ይጠቀሙ ወይም በገበያው የጥያቄ ቅጽ መልዕክት ይላኩ።'
    ],
    fallback: 'በአቅራቢ ምዝገባ፣ የቡና ዝርዝሮችን ማግኘትና የገበያ መገናኛ መረጃ ላይ እረዳለሁ።',
    signIn: 'እባክዎ የMEA BOKO መለያዎ ውስጥ ይግቡ።', failed: 'AI ረዳቱ አሁን ዝግጁ አይደለም።', thinking: 'በማሰብ ላይ…'
  },
  om: {
    title: 'Gargaaraa Gabaa MEA BOKO',
    subtitle: 'Gargaarsa gabaa buna',
    welcome: 'Akkam! Gabaa buna MEA BOKO irratti si qajeelcha. Mata-duree armaan gadii keessaa filadhu.',
    placeholder: 'Waa’ee bunaa, bituu ykn gurguruu gaafadhu…',
    send: 'Ergi',
    prompts: ['Dhiyeessaa akkamittan ta’a?', 'Buna Itoophiyaa akkamittan argadha?', 'Garee gabaa akkamittan qunnama?'],
    answers: [
      'Dhiyeessaa ta’uuf, gara herrega MEA BOKO seeni, “For suppliers” bani, unka galmee dhiyeessaa guutiitii qorannoof ergi. Mirkaneessi ragaa daldalaa irratti hundaa’a.',
      'Marketplace baniitii barbaacha fi calaltuu fayyadamuun tarree bunaa mirkanaa’e gosa oomishaa, gabaa fi maddaatiin ilaali.',
      'Gargaarsaaf odeeffannoo quunnamtii marsariitii MEA BOKO irratti maxxanfame fayyadami ykn unka gaaffii gabaa irraa ergaa ergi.'
    ],
    fallback: 'Galmee dhiyeessaa, tarree bunaa fi quunnamtii gabaa irratti si gargaaruu nan danda’a.',
    signIn: 'Maaloo jalqaba gara herrega MEA BOKO seeni.', failed: 'Gargaaraan AI amma qophaa’aa miti.', thinking: 'Yaadaa jira…'
  }
};


export default function MarketAssistant() {
  const [language, setLanguage] = useState('en');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = useMemo(() => copy[language], [language]);

  async function send(value = draft) {
    const question = value.trim();
    if (!question || busy) return;
    setDraft('');
    setMessages((items) => [...items, { from: 'user', text: question }]);
    setBusy(true);
    try {
      if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessages((items) => [...items, { from: 'assistant', text: t.signIn }]);
        return;
      }
      const { data, error } = await supabase.functions.invoke('mea-boko-ai', { body: { message: question, language } });
      if (error) throw error;
      setMessages((items) => [...items, { from: 'assistant', text: data?.answer || t.failed }]);
    } catch (_error) {
      setMessages((items) => [...items, { from: 'assistant', text: t.failed }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="market-assistant" aria-label="MEA BOKO market assistant">
      {open && <section className="assistant-window">
        <header className="assistant-header"><div><b>{t.title}</b><small>{t.subtitle} · AI support</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">×</button></header>
        <label className="assistant-language">Language
          <select value={language} onChange={(event) => { setLanguage(event.target.value); setMessages([]); }}>
            <option value="en">English</option><option value="am">አማርኛ</option><option value="om">Afaan Oromo</option>
          </select>
        </label>
        <div className="assistant-messages" aria-live="polite">
          <div className="assistant-bubble">{t.welcome}</div>
          {messages.map((item, index) => <div className={item.from === 'user' ? 'assistant-bubble user-bubble' : 'assistant-bubble'} key={index}>{item.text}</div>)}
        </div>
        {messages.length === 0 && <div className="assistant-prompts">{t.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => send(prompt)}>{prompt}</button>)}</div>}
        <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t.placeholder} aria-label={t.placeholder}/>
          <button type="submit" disabled={busy}>{busy ? t.thinking : t.send}</button>
        </form>
        <p className="assistant-disclaimer">AI replies may be imperfect. Do not share passwords, payment details or private documents.</p>
      </section>}
      <button type="button" className="assistant-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open}>✦ <span>MEA BOKO AI</span></button>
    </aside>
  );
}
