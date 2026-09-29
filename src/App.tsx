import { useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowUpRight, Bell, Check, ChevronDown, ChevronRight, Heart, ImagePlus, MapPin,
  Menu, Mic, Plus, Search, Send, Settings, Sparkles as Gem, SlidersHorizontal, Star, UserRound, X,
} from 'lucide-react'

type Page = 'ai' | 'explore' | 'rentals' | 'list' | 'profile' | 'wardrobe'
type Product = {
  id: number; name: string; price: number; image: string; category: string; size: string;
  distance: string; availability: string; color: string; style: string; occasion: string;
  material: string; owner: string; ownerType: string; rating: number; isAvailable: boolean;
}

const products: Product[] = [
  { id: 1, name: 'Black Satin Midi Dress', price: 450, image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=85', category: 'Dresses', size: 'M', distance: '1.2 km', availability: 'Available today', color: 'Black', style: 'Elegant', occasion: 'Wedding / Party', material: 'Satin', owner: 'Priya', ownerType: 'Nearby owner', rating: 4.9, isAvailable: true },
  { id: 2, name: 'Oversized Black Blazer', price: 350, image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=85', category: 'Blazers', size: 'M', distance: '2.1 km', availability: 'Available tomorrow', color: 'Black', style: 'Classic', occasion: 'Work / Evening', material: 'Wool blend', owner: 'The Edit Studio', ownerType: 'Local boutique', rating: 4.8, isAvailable: true },
  { id: 3, name: 'Lavender Lehenga Set', price: 800, image: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=900&q=85', category: 'Lehengas', size: 'S', distance: '3.4 km', availability: 'Available this week', color: 'Lavender', style: 'Traditional', occasion: 'Wedding', material: 'Silk', owner: 'Maya', ownerType: 'Nearby owner', rating: 5, isAvailable: true },
  { id: 4, name: 'Minimal Co-ord Set', price: 400, image: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=85', category: 'Co-ords', size: 'M', distance: '0.8 km', availability: 'Available today', color: 'Ivory', style: 'Minimal', occasion: 'Everyday / Brunch', material: 'Linen', owner: 'Anika', ownerType: 'Nearby owner', rating: 4.7, isAvailable: true },
  { id: 5, name: 'Ivory Silk Saree', price: 650, image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=85', category: 'Sarees', size: 'Free size', distance: '2.8 km', availability: 'Available today', color: 'Ivory', style: 'Classic', occasion: 'Celebration', material: 'Silk', owner: 'Varnam', ownerType: 'Local boutique', rating: 4.9, isAvailable: true },
  { id: 6, name: 'Cobalt Evening Suit', price: 550, image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=900&q=85', category: 'Suits', size: 'L', distance: '4.2 km', availability: 'Available tomorrow', color: 'Cobalt', style: 'Statement', occasion: 'Party', material: 'Crepe', owner: 'Arjun', ownerType: 'Nearby owner', rating: 4.6, isAvailable: true },
]
const categories = ['All pieces', 'Dresses', 'Blazers', 'Sarees', 'Lehengas', 'Co-ords', 'Suits']

function App() {
  const [page, setPage] = useState<Page>('ai')
  const [selected, setSelected] = useState<Product | null>(null)
  const [favorites, setFavorites] = useState<number[]>([3])
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [category, setCategory] = useState('All pieces')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')

  const filtered = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'All pieces' || product.category === category
    const matchesQuery = !query || `${product.name} ${product.category} ${product.style}`.toLowerCase().includes(query.toLowerCase())
    return matchesCategory && matchesQuery
  }), [category, query])

  const toggleFavorite = (id: number) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  const submitPrompt = (value = query) => { if (!value.trim()) return; setSubmittedQuery(value); setPage('ai') }

  if (selected) return <ProductDetail product={selected} favorite={favorites.includes(selected.id)} onFavorite={() => toggleFavorite(selected.id)} onBack={() => setSelected(null)} onRent={() => { setSelected(null); setPage('rentals'); notify('Rental request started') }} />

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setPage('ai')}><span className="brand-mark">D</span><span>DRAPE</span></button>
      <nav className="desktop-nav">
        <NavButton active={page === 'ai'} onClick={() => setPage('ai')} icon={<Gem size={15} />}>AI Stylist</NavButton>
        <NavButton active={page === 'explore'} onClick={() => setPage('explore')}>Explore</NavButton>
        <NavButton active={page === 'rentals'} onClick={() => setPage('rentals')}>My Rentals</NavButton>
        <NavButton active={page === 'list'} onClick={() => setPage('list')}>List Item</NavButton>
      </nav>
      <div className="top-actions">
        <button className="location"><MapPin size={15} /> Chennai <ChevronDown size={13} /></button>
        <button className="icon-button"><Bell size={17} /></button>
        <button className="avatar" onClick={() => setPage('profile')}>AK</button>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button>
      </div>
    </header>
    {menuOpen && <div className="mobile-nav">{(['ai', 'explore', 'rentals', 'list', 'profile'] as Page[]).map((item) => <button key={item} onClick={() => { setPage(item); setMenuOpen(false) }}>{item === 'ai' ? 'AI Stylist' : item === 'list' ? 'List Item' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>}

    <main className="main-content">
      {page === 'ai' && <Home query={query} setQuery={setQuery} submittedQuery={submittedQuery} submitPrompt={submitPrompt} products={products} favorites={favorites} toggleFavorite={toggleFavorite} onSelect={setSelected} onExplore={() => setPage('explore')} />}
      {page === 'explore' && <Explore query={query} setQuery={setQuery} category={category} setCategory={setCategory} products={filtered} favorites={favorites} toggleFavorite={toggleFavorite} onSelect={setSelected} />}
      {page === 'rentals' && <Rentals onExplore={() => setPage('explore')} />}
      {page === 'list' && <ListItem onPublish={() => notify('Your piece is ready to be published')} />}
      {page === 'profile' && <Profile onPage={setPage} />}
      {page === 'wardrobe' && <Wardrobe onExplore={() => setPage('explore')} />}
    </main>
    <div className="mobile-bottom-nav">{(['ai', 'explore', 'rentals', 'list', 'profile'] as Page[]).map((item) => <button className={page === item ? 'active' : ''} key={item} onClick={() => setPage(item)}><span>{item === 'ai' ? <Gem size={17} /> : item === 'explore' ? <Search size={17} /> : item === 'rentals' ? <Check size={17} /> : item === 'list' ? <Plus size={18} /> : <UserRound size={17} />}</span>{item === 'ai' ? 'AI' : item === 'list' ? 'List' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {toast && <div className="toast"><Check size={16} /> {toast}</div>}
  </div>
}

function NavButton({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon?: React.ReactNode }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}{children}</button> }

function Home({ query, setQuery, submittedQuery, submitPrompt, products, favorites, toggleFavorite, onSelect, onExplore }: { query: string; setQuery: (value: string) => void; submittedQuery: string; submitPrompt: (value?: string) => void; products: Product[]; favorites: number[]; toggleFavorite: (id: number) => void; onSelect: (product: Product) => void; onExplore: () => void }) {
  const suggestions = ['Find an outfit for a wedding', 'Find this look', 'Something under ₹700']
  return <div className="home-page">
    <div className="hero-visual"><div className="hero-wash" /><img src="/image.png" alt="Editorial fashion portrait" /></div>
    <aside className="editorial-note"><div className="script">Wear<br />Share<br />Belong</div><p>GREAT OUTFITS<br />SHOULDN'T<br />BE WORN ONCE.</p></aside>
    <section className="hero-content">
      <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL STYLIST, NEARBY</div>
      <h1>What are you<br /><em>looking for?</em></h1>
      <p className="hero-subtitle">Tell me what you need, show me a photo, or just ask.</p>
      <div className="prompt-wrap"><textarea value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitPrompt() } }} placeholder="Ask for an outfit..." rows={2} /><div className="prompt-tools"><button className="tool-button" title="Upload inspiration"><ImagePlus size={18} /></button><button className="tool-button" title="Use voice"><Mic size={18} /></button><button className="send-button" onClick={() => submitPrompt()} title="Find an outfit"><ArrowUpRight size={22} /></button></div></div>
      <div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion} className="suggestion" onClick={() => { setQuery(suggestion); submitPrompt(suggestion) }}><Gem size={14} />{suggestion}</button>)}</div>
      {submittedQuery && <div className="ai-response"><div className="ai-response-head"><span className="ai-avatar"><Gem size={14} /></span><span>DRAPE AI</span><span className="response-label">Just now</span></div><p>I found pieces near you for <strong>“{submittedQuery}”</strong>. Here are a few that fit your style and budget.</p><button onClick={onExplore}>See all matches <ArrowUpRight size={15} /></button></div>}
    </section>
    <section className="nearby-section"><div className="section-heading"><div><span className="section-kicker">CURATED AROUND YOU</span><h2>Picked for you nearby <span className="heading-arrow"><ChevronRight size={17} /></span></h2></div><button className="text-button" onClick={onExplore}>See all <ArrowUpRight size={15} /></button></div><div className="product-row">{products.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} favorite={favorites.includes(product.id)} onFavorite={() => toggleFavorite(product.id)} onSelect={() => onSelect(product)} />)}</div></section>
  </div>
}

function ProductCard({ product, favorite, onFavorite, onSelect }: { product: Product; favorite: boolean; onFavorite: () => void; onSelect: () => void }) { return <article className="product-card"><button className="product-image-button" onClick={onSelect}><img src={product.image} alt={product.name} /><div className="distance"><MapPin size={12} />{product.distance}</div></button><button className={`favorite ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label="Save item"><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></button><button className="product-copy" onClick={onSelect}><h3>{product.name}</h3><div className="product-meta"><span><strong>₹{product.price}</strong> / day</span><span>{product.size}</span></div><div className="availability"><span className="availability-dot" />{product.availability}</div></button></article> }

function Explore({ query, setQuery, category, setCategory, products, favorites, toggleFavorite, onSelect }: { query: string; setQuery: (value: string) => void; category: string; setCategory: (value: string) => void; products: Product[]; favorites: number[]; toggleFavorite: (id: number) => void; onSelect: (product: Product) => void }) { return <div className="explore-page"><div className="page-intro"><div><span className="section-kicker">THE NEARBY EDIT</span><h1>Explore <em>pieces</em></h1><p>Borrow beautifully. Keep things moving.</p></div><div className="explore-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dresses, blazers, styles..." /></div></div><div className="category-scroll">{categories.map((item) => <button className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="filter-row"><button><SlidersHorizontal size={15} /> Filters</button><span>{products.length} pieces near Chennai</span><button className="sort-button">Sort: Recommended <ChevronDown size={14} /></button></div><div className="explore-grid">{products.map((product) => <ProductCard key={product.id} product={product} favorite={favorites.includes(product.id)} onFavorite={() => toggleFavorite(product.id)} onSelect={() => onSelect(product)} />)}</div>{products.length === 0 && <div className="empty-state"><Gem size={25} /><h2>Nothing matching nearby yet.</h2><p>Try a different style or expand your search radius.</p></div>}</div> }

function ProductDetail({ product, favorite, onFavorite, onBack, onRent }: { product: Product; favorite: boolean; onFavorite: () => void; onBack: () => void; onRent: () => void }) { return <div className="detail-page"><button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Back to explore</button><div className="detail-layout"><div className="detail-gallery"><img src={product.image} alt={product.name} /><div className="gallery-caption"><MapPin size={14} /> {product.distance} from you · {product.availability}</div></div><div className="detail-info"><div className="detail-label">{product.category} · {product.style}</div><h1>{product.name}</h1><div className="detail-price"><strong>₹{product.price}</strong> / day <span><Star size={14} fill="currentColor" /> {product.rating}</span></div><p className="detail-description">A considered piece from {product.owner}, ready for its next story. Rent it nearby, wear it well, and send it forward.</p><div className="owner-row"><div className="owner-avatar">{product.owner[0]}</div><div><strong>{product.owner}</strong><span>{product.ownerType} · {product.distance} away</span></div><ChevronRight size={17} /></div><div className="detail-actions"><button className="primary-button" onClick={onRent}>Rent this piece <ArrowUpRight size={17} /></button><button className={`save-button ${favorite ? 'saved' : ''}`} onClick={onFavorite}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? 'Saved' : 'Save'}</button></div><div className="why-match"><div className="why-title"><Gem size={16} /> Why this matches you</div>{['Matches your preferred style', 'Available near you tomorrow', `Fits your ${product.size} size preference`].map((reason) => <div className="match-row" key={reason}><Check size={14} />{reason}</div>)}</div><div className="attributes"><h3>The details</h3><div className="attribute-grid">{[['Color', product.color], ['Size', product.size], ['Fit', 'Regular'], ['Occasion', product.occasion], ['Material', product.material], ['Condition', 'Excellent']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div></div></div></div> }

function Rentals({ onExplore }: { onExplore: () => void }) { return <div className="simple-page"><div className="page-intro compact"><div><span className="section-kicker">YOUR CLOSET, IN MOTION</span><h1>My <em>rentals</em></h1><p>Everything you have borrowed, in one place.</p></div></div><div className="tabs"><button className="active">Upcoming <span>1</span></button><button>Active</button><button>Past</button></div><div className="rental-card"><img src={products[1].image} alt={products[1].name} /><div className="rental-body"><span className="status-pill"><span /> Confirmed</span><h2>{products[1].name}</h2><div className="rental-details"><div><span>Pickup</span><strong>Tomorrow · 4:00 PM</strong></div><div><span>Return</span><strong>Sunday · 6:00 PM</strong></div><div><span>Location</span><strong>Adyar, Chennai</strong></div></div><button className="outline-button">View details <ArrowUpRight size={15} /></button></div></div><div className="empty-rental"><span className="empty-ring"><Gem size={19} /></span><h2>Your next look is nearby.</h2><p>Find something special to borrow for your next plan.</p><button className="text-button" onClick={onExplore}>Explore nearby pieces <ArrowUpRight size={15} /></button></div></div> }

function ListItem({ onPublish }: { onPublish: () => void }) { const [uploaded, setUploaded] = useState(false); return <div className="simple-page listing-page"><div className="page-intro compact"><div><span className="section-kicker">GIVE YOUR CLOSET A SECOND LIFE</span><h1>List a <em>piece</em></h1><p>AI will handle the details. You just set the terms.</p></div></div><div className="listing-flow"><div className={`upload-panel ${uploaded ? 'uploaded' : ''}`} onClick={() => setUploaded(true)}>{uploaded ? <><img src={products[0].image} alt="Uploaded piece" /><div className="upload-overlay"><Check size={18} /> Image ready</div></> : <><span className="upload-icon"><ImagePlus size={24} /></span><h2>Drop in a photo</h2><p>We'll identify the piece and fill in the details.</p><span className="upload-link">Choose from device</span></>}</div><div className="listing-form"><div className="form-step"><span>01</span><div><strong>AI detection</strong><p>{uploaded ? 'Black midi dress · Satin · Size M' : 'Upload an image to get started'}</p></div><span className={uploaded ? 'step-done' : 'step-wait'}>{uploaded ? <Check size={14} /> : '—'}</span></div><div className="form-step"><span>02</span><div><strong>Set your terms</strong><p>₹450 / day · Available from tomorrow</p></div><Settings size={16} /></div><button className="primary-button full-width" disabled={!uploaded} onClick={onPublish}>Publish item <ArrowUpRight size={17} /></button></div></div><div className="demand-note"><Gem size={17} /><div><strong>People nearby are looking for this</strong><p>4 people within 3 km are looking for a black blazer or dress this week.</p></div><ArrowUpRight size={17} /></div></div> }

function Profile({ onPage }: { onPage: (page: Page) => void }) { return <div className="simple-page profile-page"><div className="profile-header"><div className="profile-avatar">AK</div><div><span className="section-kicker">YOUR DRAPE PROFILE</span><h1>Aditi <em>Krishnan</em></h1><p><MapPin size={14} /> Chennai · Member since 2024</p></div><button className="icon-button"><Settings size={18} /></button></div><div className="stats"><div><strong>08</strong><span>Items listed</span></div><div><strong>12</strong><span>Rentals</span></div><div><strong>₹24.8k</strong><span>Earned sharing</span></div></div><div className="profile-links">{[['wardrobe', 'My Wardrobe', '12 pieces in your closet'], ['list', 'My Listings', '4 active pieces'], ['rentals', 'My Rentals', '1 upcoming rental'], ['profile', 'Saved Items', `${3} pieces saved`]].map(([key, title, subtitle]) => <button key={key} onClick={() => onPage(key as Page)}><span className="link-icon"><Gem size={16} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronRight size={17} /></button>)}</div><div className="profile-foot"><button><Settings size={16} /> Settings</button><button>Help & support</button></div></div> }

function Wardrobe({ onExplore }: { onExplore: () => void }) { return <div className="simple-page wardrobe-page"><div className="page-intro compact"><div><span className="section-kicker">WHAT YOU ALREADY OWN</span><h1>My <em>wardrobe</em></h1><p>Build a look from what is yours, then fill the gaps nearby.</p></div></div><div className="wardrobe-summary"><div><strong>12</strong><span>Total pieces</span></div><div><strong>04</strong><span>Outfit ideas</span></div><button className="primary-button" onClick={onExplore}>Build an outfit <ArrowUpRight size={16} /></button></div><div className="wardrobe-grid">{products.slice(0, 4).map((product) => <div className="wardrobe-card" key={product.id}><img src={product.image} alt={product.name} /><div><strong>{product.name}</strong><span>{product.category} · {product.color}</span></div></div>)}</div><div className="demand-note"><Gem size={17} /><div><strong>You already have the trousers and shoes.</strong><p>You only need a blazer to complete your dinner look.</p></div><button className="text-button" onClick={onExplore}>Find nearby <ArrowUpRight size={15} /></button></div></div> }

export default App
