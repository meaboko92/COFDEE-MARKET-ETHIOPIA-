import { useMemo, useState } from 'react';

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
    fallback: 'I can currently help with supplier registration, finding coffee listings and marketplace contact guidance. For account-specific questions, please contact the MEA BOKO team.'
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
    fallback: 'በአቅራቢ ምዝገባ፣ የቡና ዝርዝሮችን ማግኘትና የገበያ መገናኛ መረጃ ላይ እረዳለሁ። ለመለያዎ የተለየ ጥያቄ የMEA BOKO ቡድንን ያነጋግሩ።'
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
    fallback: 'Galmee dhiyeessaa, tarree bunaa barbaaduu fi odeeffannoo quunnamtii gabaa irratti si gargaaruu nan danda’a. Gaaffii herrega dhuunfaatiif garee MEA BOKO qunnami.'
  }
};

function getAnswer(message, language) {
  const text = message.toLowerCase();
  const index = /supplier|sell|apply|dhiyeess|gurgur|አቅራቢ|ሽያጭ/.test(text) ? 0
    : /coffee|find|buy|marketplace|buna|bit|ቡና|ግዢ/.test(text) ? 1
    : /contact|phone|team|qunn|አገኛለሁ|መገናኛ/.test(text) ? 2 : -1;
  return index < 0 ? copy[language].fallback : copy[language].answers[index];
}

export default function MarketAssistant() {
  const [language, setLanguage] = useState('en');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const t = useMemo(() => copy[language], [language]);

  function send(value = draft) {
    const question = value.trim();
    if (!question) return;
    setMessages((items) => [...items, { from: 'user', text: question }, { from: 'assistant', text: getAnswer(question, language) }]);
    setDraft('');
  }

  return (
    <aside className="market-assistant" aria-label="MEA BOKO market assistant">
      {open && <section className="assistant-window">
        <header className="assistant-header"><div><b>{t.title}</b><small>{t.subtitle} · Help preview</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">×</button></header>
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
          <button type="submit">{t.send}</button>
        </form>
        <p className="assistant-disclaimer">Automated help preview. Not connected to a live AI service yet.</p>
      </section>}
      <button type="button" className="assistant-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open}>✦ <span>MEA BOKO AI</span></button>
    </aside>
  );
}
