import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowUpRight, Bell, Check, ChevronDown, ChevronRight, Heart, ImagePlus, MapPin,
  Menu, Mic, Plus, Search, Send, Settings, Sparkles as Gem, SlidersHorizontal, Star, UserRound, X,
} from 'lucide-react'
import type { Area, Draft, Listing, SearchResponse } from '../shared/contracts'
import { CATEGORIES, GENDERS, OCCASIONS, SIZES, type Size } from '../shared/vocab'
import { api, ApiError } from './api'
import { categoryLabel, downscaleImage, formatKm, kmBetween, occasionLabel, rupees, storage, titleCase } from './lib'

type Page = 'ai' | 'explore' | 'rentals' | 'list' | 'profile' | 'wardrobe'
// A listing as the UI sees it: from GET /api/listings, GET /api/listings/:id, or a search result.
type Piece = Listing & { reason?: string | null; similarity?: number }
type SearchFilters = { size?: Size; max_price?: number }
type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; turns: string[] }
  | { status: 'done'; turns: string[]; response: SearchResponse }
  | { status: 'error'; turns: string[]; message: string }

// Mock data for the V1 screens that are out of v0 scope (My Rentals, Wardrobe) — unchanged from the original design.
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
]

const DEFAULT_AREA = 'Adyar'
const BUDGETS = [300, 500, 800, 1000, 1500, 2500]
const SUGGESTIONS = ['Outfit for a sangeet, M, under ₹800', 'Interview suit for my brother', 'Party dress under ₹700']
const occasionChips = ['All pieces', ...OCCASIONS.map(occasionLabel)]

function App() {
  const [page, setPage] = useState<Page>('ai')
  const [selected, setSelected] = useState<Piece | null>(null)
  const [favorites, setFavorites] = useState<string[]>(() => storage.get('drape:favorites', []))
  const [areas, setAreas] = useState<Area[]>([])
  const [area, setArea] = useState<string>(() => storage.get('drape:area', DEFAULT_AREA))
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({})
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const [nearby, setNearby] = useState<Listing[] | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const searchSeq = useRef(0)

  useEffect(() => { api.areas().then(setAreas).catch(() => setAreas([])) }, [])
  useEffect(() => { api.listings({ limit: 48 }).then(setNearby).catch(() => setNearby([])) }, [])
  useEffect(() => { storage.set('drape:area', area) }, [area])
  useEffect(() => { storage.set('drape:favorites', favorites) }, [favorites])

  const areaCoords = useMemo(() => new Map(areas.map((a) => [a.name, a])), [areas])
  // Distance from the selected area: search results carry it from PostGIS; other listings use area centroids.
  const distanceTo = useCallback((piece: Piece): number | null => {
    if (piece.distance_km != null) return piece.distance_km
    const from = areaCoords.get(area)
    const to = areaCoords.get(piece.area)
    return from && to ? kmBetween(from, to) : null
  }, [area, areaCoords])
  const byDistance = useCallback((list: Piece[]) => [...list].sort((a, b) => (distanceTo(a) ?? 99) - (distanceTo(b) ?? 99)), [distanceTo])

  const toggleFavorite = (id: string) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3200) }

  const runSearch = useCallback(async (turns: string[], searchArea = area, searchFilters = filters) => {
    const seq = ++searchSeq.current
    const text = turns.join('. ')
    setSearch({ status: 'loading', turns })
    try {
      const response = await api.search({ query: text, area: searchArea, ...searchFilters })
      if (seq !== searchSeq.current) return
      setSearch({ status: 'done', turns, response })
      const top = response.results.slice(0, 6).map((r) => r.id)
      if (top.length === 0) return
      // "Why it fits" arrives a moment after the results so the grid never waits on it.
      const reasons = await api.reasons(text, top).catch(() => [])
      if (seq !== searchSeq.current || reasons.length === 0) return
      const byId = new Map(reasons.map((r) => [r.id, r.reason]))
      setSearch((current) => current.status === 'done'
        ? { ...current, response: { ...current.response, results: current.response.results.map((r) => ({ ...r, reason: byId.get(r.id) ?? r.reason })) } }
        : current)
    } catch (error) {
      if (seq !== searchSeq.current) return
      setSearch({ status: 'error', turns, message: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' })
    }
  }, [area, filters])

  // Typing while results are showing refines them ("something less heavy"); suggestions always start fresh.
  const submitPrompt = (value = query, fresh = false) => {
    const text = value.trim()
    if (!text) return
    const previous = !fresh && search.status !== 'idle' ? search.turns : []
    setQuery('')
    setPage('ai')
    runSearch([...previous, text])
  }
  const startOver = () => { searchSeq.current++; setSearch({ status: 'idle' }); setQuery('') }
  const changeArea = (next: string) => {
    setArea(next)
    if (search.status !== 'idle') runSearch(search.turns, next)
  }
  const changeFilters = (next: SearchFilters) => {
    setFilters(next)
    if (search.status !== 'idle') runSearch(search.turns, area, next)
  }

  const openPiece = (piece: Piece) => { setSelected(piece); window.scrollTo(0, 0) }
  const searchContext = search.status === 'done' ? search.response.parsed : null

  const toastNode = toast && <div className="toast" role="status"><Check size={16} /> {toast}</div>
  if (selected) return <><ProductDetail piece={selected} distance={distanceTo(selected)} area={area} context={searchContext} favorite={favorites.includes(selected.id)} onFavorite={() => toggleFavorite(selected.id)} onBack={() => setSelected(null)} />{toastNode}</>

  const areaOptions = areas.length ? areas.map((a) => a.name) : [area]
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
        <label className="location has-select" title="Your area"><MapPin size={15} /> {area} <ChevronDown size={13} /><AreaSelect value={area} options={areaOptions} onChange={changeArea} /></label>
        <button className="icon-button"><Bell size={17} /></button>
        <button className="avatar" onClick={() => setPage('profile')}>AK</button>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button>
      </div>
    </header>
    {menuOpen && <div className="mobile-nav">
      <div className="has-select"><button tabIndex={-1} aria-hidden="true"><MapPin size={13} /> {area} ▾</button><AreaSelect value={area} options={areaOptions} onChange={(next) => { changeArea(next); setMenuOpen(false) }} /></div>
      {(['ai', 'explore', 'rentals', 'list', 'profile'] as Page[]).map((item) => <button key={item} onClick={() => { setPage(item); setMenuOpen(false) }}>{item === 'ai' ? 'AI Stylist' : item === 'list' ? 'List Item' : item[0].toUpperCase() + item.slice(1)}</button>)}
    </div>}

    <main className="main-content">
      {page === 'ai' && <Home query={query} setQuery={setQuery} submitPrompt={submitPrompt} search={search} startOver={startOver} retry={() => search.status !== 'idle' && runSearch(search.turns)} filters={filters} setFilters={changeFilters} area={area} nearby={nearby ? byDistance(nearby).slice(0, 4) : null} distanceTo={distanceTo} favorites={favorites} toggleFavorite={toggleFavorite} onSelect={openPiece} onExplore={() => setPage('explore')} />}
      {page === 'explore' && <Explore area={area} byDistance={byDistance} distanceTo={distanceTo} favorites={favorites} toggleFavorite={toggleFavorite} onSelect={openPiece} />}
      {page === 'rentals' && <Rentals onExplore={() => setPage('explore')} />}
      {page === 'list' && <ListItem areas={areaOptions} defaultArea={area} onPublished={(listing) => { notify('Your piece is live — it shows up in search right now'); setNearby((current) => [listing, ...(current ?? [])]); openPiece(listing) }} onError={notify} />}
      {page === 'profile' && <Profile onPage={setPage} />}
      {page === 'wardrobe' && <Wardrobe onExplore={() => setPage('explore')} />}
    </main>
    <div className="mobile-bottom-nav">{(['ai', 'explore', 'rentals', 'list', 'profile'] as Page[]).map((item) => <button className={page === item ? 'active' : ''} key={item} onClick={() => setPage(item)}><span>{item === 'ai' ? <Gem size={17} /> : item === 'explore' ? <Search size={17} /> : item === 'rentals' ? <Check size={17} /> : item === 'list' ? <Plus size={18} /> : <UserRound size={17} />}</span>{item === 'ai' ? 'AI' : item === 'list' ? 'List' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {toastNode}
  </div>
}

// A native <select> laid invisibly over an existing control: the design stays as-is, and the picker is fully accessible.
function AreaSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <select className="overlay-select" aria-label="Choose your area" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
}

function NavButton({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon?: React.ReactNode }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}{children}</button> }

function Home({ query, setQuery, submitPrompt, search, startOver, retry, filters, setFilters, area, nearby, distanceTo, favorites, toggleFavorite, onSelect, onExplore }: { query: string; setQuery: (value: string) => void; submitPrompt: (value?: string, fresh?: boolean) => void; search: SearchState; startOver: () => void; retry: () => void; filters: SearchFilters; setFilters: (filters: SearchFilters) => void; area: string; nearby: Listing[] | null; distanceTo: (piece: Piece) => number | null; favorites: string[]; toggleFavorite: (id: string) => void; onSelect: (piece: Piece) => void; onExplore: () => void }) {
  const refining = search.status === 'done' || search.status === 'error'
  const latest = search.status === 'idle' ? '' : search.turns[search.turns.length - 1]
  const results = search.status === 'done' ? search.response.results : []
  return <div className="home-page">
    <div className="hero-visual"><div className="hero-wash" /><img src="/image.png" alt="Editorial fashion portrait" /></div>
    <aside className="editorial-note"><div className="script">Wear<br />Share<br />Belong</div><p>GREAT OUTFITS<br />SHOULDN'T<br />BE WORN ONCE.</p></aside>
    <section className="hero-content">
      <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL STYLIST, NEARBY</div>
      <h1>What are you<br /><em>looking for?</em></h1>
      <p className="hero-subtitle">Tell me what you need, show me a photo, or just ask.</p>
      <div className="prompt-wrap"><textarea value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitPrompt() } }} placeholder={refining ? 'Refine these results — e.g. “something less heavy”' : 'Ask for an outfit...'} rows={2} aria-label="Describe what you need" /><div className="prompt-tools"><button className="tool-button" title="Upload inspiration"><ImagePlus size={18} /></button><button className="tool-button" title="Use voice"><Mic size={18} /></button>
        <label className="suggestion prompt-chip has-select">{filters.size ? `Size ${filters.size}` : 'Any size'} <ChevronDown size={12} /><select className="overlay-select" aria-label="Size" value={filters.size ?? ''} onChange={(event) => setFilters({ ...filters, size: (event.target.value || undefined) as Size | undefined })}><option value="">Any size</option>{SIZES.map((size) => <option key={size} value={size}>{size === 'FREE' ? 'Free size' : size}</option>)}</select></label>
        <label className="suggestion prompt-chip has-select">{filters.max_price ? `Under ${rupees(filters.max_price)}` : 'Any budget'} <ChevronDown size={12} /><select className="overlay-select" aria-label="Budget per day" value={filters.max_price ?? ''} onChange={(event) => setFilters({ ...filters, max_price: event.target.value ? Number(event.target.value) : undefined })}><option value="">Any budget</option>{BUDGETS.map((budget) => <option key={budget} value={budget}>Under {rupees(budget)} / day</option>)}</select></label>
        <button className="send-button" onClick={() => submitPrompt()} title="Find an outfit" disabled={search.status === 'loading'}><ArrowUpRight size={22} /></button></div></div>
      <div className="suggestions">{SUGGESTIONS.map((suggestion) => <button key={suggestion} className="suggestion" onClick={() => submitPrompt(suggestion, true)}><Gem size={14} />{suggestion}</button>)}</div>
      {search.status !== 'idle' && <div className="ai-response" aria-live="polite">
        <div className="ai-response-head"><span className="ai-avatar"><Gem size={14} /></span><span>DRAPE AI</span><span className="response-label">{search.status === 'loading' ? 'Thinking…' : 'Just now'}</span></div>
        {search.status === 'loading' && <p>Looking for pieces near <strong>{area}</strong> for <strong>“{latest}”</strong>…</p>}
        {search.status === 'error' && <><p>{search.message}</p><button onClick={retry}>Try again <ArrowUpRight size={15} /></button></>}
        {search.status === 'done' && <>
          {search.response.relaxed && <p>{search.response.relaxed}</p>}
          <p>{results.length ? <>I found {results.length} {results.length === 1 ? 'piece' : 'pieces'} for <strong>“{latest}”</strong>{search.turns.length > 1 ? ' (refining your earlier request)' : ''}. <ParsedSummary parsed={search.response.parsed} /></> : <>Nothing matches <strong>“{latest}”</strong> yet — try a different occasion, size or budget.</>}</p>
          <button onClick={startOver}>Start a new search <ArrowUpRight size={15} /></button>
        </>}
      </div>}
    </section>
    {search.status === 'idle' || search.status === 'error'
      ? <section className="nearby-section"><div className="section-heading"><div><span className="section-kicker">CURATED AROUND {area.toUpperCase()}</span><h2>Picked for you nearby <span className="heading-arrow"><ChevronRight size={17} /></span></h2></div><button className="text-button" onClick={onExplore}>See all <ArrowUpRight size={15} /></button></div>
        <div className="product-row">{nearby === null ? <SkeletonCards count={4} /> : nearby.map((piece) => <ProductCard key={piece.id} piece={piece} distance={distanceTo(piece)} favorite={favorites.includes(piece.id)} onFavorite={() => toggleFavorite(piece.id)} onSelect={() => onSelect(piece)} />)}</div>
        {nearby?.length === 0 && <div className="empty-state"><Gem size={25} /><h2>Nothing listed nearby yet.</h2><p>Be the first — list a piece from your wardrobe.</p></div>}</section>
      : <section className="nearby-section"><div className="section-heading"><div><span className="section-kicker">MATCHED FOR YOU</span><h2>Results near {area} <span className="heading-arrow"><ChevronRight size={17} /></span></h2></div><button className="text-button" onClick={startOver}>Start over <ArrowUpRight size={15} /></button></div>
        <div className="product-row">{search.status === 'loading' ? <SkeletonCards count={4} /> : results.map((piece) => <ProductCard key={piece.id} piece={piece} distance={distanceTo(piece)} favorite={favorites.includes(piece.id)} onFavorite={() => toggleFavorite(piece.id)} onSelect={() => onSelect(piece)} />)}</div></section>}
  </div>
}

function ParsedSummary({ parsed }: { parsed: SearchResponse['parsed'] }) {
  const parts = [
    parsed.occasion && occasionLabel(parsed.occasion),
    parsed.size && (parsed.size === 'FREE' ? 'Free size' : `Size ${parsed.size}`),
    parsed.max_price && `Under ${rupees(parsed.max_price)}/day`,
    parsed.gender && (parsed.gender === 'men' ? "Men's" : "Women's"),
  ].filter(Boolean)
  return parts.length ? <>Looking for: {parts.join(' · ')}.</> : null
}

function SkeletonCards({ count }: { count: number }) { return <>{Array.from({ length: count }, (_, i) => <article className="product-card is-loading" key={i} aria-hidden="true"><div className="product-image-button" /><div className="product-copy"><h3>&nbsp;</h3></div></article>)}</> }

function ProductCard({ piece, distance, favorite, onFavorite, onSelect }: { piece: Piece; distance: number | null; favorite: boolean; onFavorite: () => void; onSelect: () => void }) { return <article className="product-card"><button className="product-image-button" onClick={onSelect}><img src={piece.image_url} alt={piece.title} loading="lazy" /><div className="distance"><MapPin size={12} />{formatKm(distance) ?? piece.area}</div></button><button className={`favorite ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label="Save item"><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></button><button className="product-copy" onClick={onSelect}><h3>{piece.title}</h3><div className="product-meta"><span><strong>{rupees(piece.price_per_day)}</strong> / day</span><span>{piece.size === 'FREE' ? 'Free size' : piece.size}</span></div><div className="availability"><span className="availability-dot" />{piece.reason ?? `In ${piece.area}`}</div></button></article> }

function Explore({ area, byDistance, distanceTo, favorites, toggleFavorite, onSelect }: { area: string; byDistance: (list: Piece[]) => Piece[]; distanceTo: (piece: Piece) => number | null; favorites: string[]; toggleFavorite: (id: string) => void; onSelect: (piece: Piece) => void }) {
  const [text, setText] = useState('')
  const [chip, setChip] = useState('All pieces')
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setListings(null)
    setFailed(false)
    const occasion = chip === 'All pieces' ? undefined : OCCASIONS[occasionChips.indexOf(chip) - 1]
    api.listings({ occasion, limit: 48 }).then((rows) => { if (live) setListings(rows) }).catch(() => { if (live) { setListings([]); setFailed(true) } })
    return () => { live = false }
  }, [chip])
  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase()
    const matches = (listings ?? []).filter((piece) => !needle || [piece.title, piece.category, ...piece.style_tags, ...(piece.colors ?? [])].join(' ').toLowerCase().includes(needle))
    return byDistance(matches)
  }, [listings, text, byDistance])
  return <div className="explore-page"><div className="page-intro"><div><span className="section-kicker">THE NEARBY EDIT</span><h1>Explore <em>pieces</em></h1><p>Borrow beautifully. Keep things moving.</p></div><div className="explore-search"><Search size={17} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Search sarees, blazers, colours..." aria-label="Filter pieces" /></div></div><div className="category-scroll">{occasionChips.map((item) => <button className={chip === item ? 'selected' : ''} key={item} onClick={() => setChip(item)}>{item}</button>)}</div><div className="filter-row"><button><SlidersHorizontal size={15} /> Filters</button><span>{listings === null ? 'Loading pieces…' : `${shown.length} ${shown.length === 1 ? 'piece' : 'pieces'} near ${area}`}</span><button className="sort-button">Sort: Nearest <ChevronDown size={14} /></button></div><div className="explore-grid">{listings === null ? <SkeletonCards count={8} /> : shown.map((piece) => <ProductCard key={piece.id} piece={piece} distance={distanceTo(piece)} favorite={favorites.includes(piece.id)} onFavorite={() => toggleFavorite(piece.id)} onSelect={() => onSelect(piece)} />)}</div>{listings !== null && shown.length === 0 && <div className="empty-state"><Gem size={25} /><h2>{failed ? 'Couldn’t load pieces right now.' : 'Nothing matching nearby yet.'}</h2><p>{failed ? 'Check your connection and try again.' : 'Try a different occasion, or ask the AI Stylist to widen the search.'}</p></div>}</div>
}

function ProductDetail({ piece: initial, distance, area, context, favorite, onFavorite, onBack }: { piece: Piece; distance: number | null; area: string; context: SearchResponse['parsed'] | null; favorite: boolean; onFavorite: () => void; onBack: () => void }) {
  const [piece, setPiece] = useState<Piece>(initial)
  const [contact, setContact] = useState<{ state: 'hidden' | 'loading' | 'shown' | 'error'; value?: string }>({ state: 'hidden' })
  // Search results carry only the fields needed for cards; load the full listing (colours, owner, formality…).
  useEffect(() => { api.listing(initial.id).then((full) => setPiece((current) => ({ ...full, reason: current.reason, distance_km: current.distance_km }))).catch(() => undefined) }, [initial.id])
  const revealContact = async () => {
    setContact({ state: 'loading' })
    try { setContact({ state: 'shown', value: (await api.contact(piece.id)).owner_contact }) } catch { setContact({ state: 'error' }) }
  }
  const km = formatKm(distance)
  const reasons = [
    piece.reason,
    context?.size && (piece.size === 'FREE' ? 'Free size — fits any size' : `Fits your ${context.size} size`),
    context?.max_price && piece.price_per_day <= context.max_price && `Within your ${rupees(context.max_price)}/day budget`,
    km && (km === 'Nearby' ? `In ${piece.area}, right near you` : `${km} from ${area}`),
    !context && piece.occasions.length > 0 && `Great for ${piece.occasions.slice(0, 3).map(occasionLabel).join(', ')}`,
  ].filter((reason): reason is string => Boolean(reason))
  const contactHref = contact.value && (/@/.test(contact.value) ? `mailto:${contact.value}` : /^[+\d][\d\s-]{6,}$/.test(contact.value) ? `tel:${contact.value.replace(/[\s-]/g, '')}` : undefined)
  return <div className="detail-page"><button className="back-button" onClick={onBack}><ArrowLeft size={16} /> {context ? 'Back to results' : 'Back'}</button><div className="detail-layout"><div className="detail-gallery"><img src={piece.image_url} alt={piece.title} /><div className="gallery-caption"><MapPin size={14} /> {km && km !== 'Nearby' ? `${km} from you · ${piece.area}` : `In ${piece.area}`}</div></div><div className="detail-info"><div className="detail-label">{categoryLabel(piece.category).toUpperCase()}{piece.style_tags[0] ? ` · ${piece.style_tags[0].toUpperCase()}` : ''}</div><h1>{piece.title}</h1><div className="detail-price"><strong>{rupees(piece.price_per_day)}</strong> / day</div><p className="detail-description">{piece.description}</p><div className="owner-row"><div className="owner-avatar">{(piece.owner_name ?? '·')[0]}</div><div><strong>{piece.owner_name ?? 'Nearby owner'}</strong><span>Nearby owner · {piece.area}{km && km !== 'Nearby' ? ` · ${km} away` : ''}</span></div><ChevronRight size={17} /></div><div className="detail-actions">
    {contact.state === 'shown' && contact.value
      ? (contactHref ? <a className="primary-button" href={contactHref}>{contact.value} <ArrowUpRight size={17} /></a> : <span className="primary-button">{contact.value}</span>)
      : <button className="primary-button" onClick={revealContact} disabled={contact.state === 'loading'}>{contact.state === 'loading' ? 'Revealing…' : contact.state === 'error' ? 'Couldn’t load — try again' : 'Show contact'} <ArrowUpRight size={17} /></button>}
    <button className={`save-button ${favorite ? 'saved' : ''}`} onClick={onFavorite}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? 'Saved' : 'Save'}</button></div>
    {reasons.length > 0 && <div className="why-match"><div className="why-title"><Gem size={16} /> Why this matches you</div>{reasons.map((reason) => <div className="match-row" key={reason}><Check size={14} />{reason}</div>)}</div>}
    <div className="attributes"><h3>The details</h3><div className="attribute-grid">{[['Colour', piece.colors?.length ? piece.colors.map(titleCase).join(', ') : '—'], ['Size', piece.size === 'FREE' ? 'Free size' : piece.size], ['Category', categoryLabel(piece.category)], ['Occasion', piece.occasions.map(occasionLabel).join(', ') || '—'], ['Style', piece.style_tags.slice(0, 3).map(titleCase).join(', ') || '—'], ['Formality', piece.formality ? `${piece.formality} / 5` : '—']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div></div></div></div>
}

function Rentals({ onExplore }: { onExplore: () => void }) { return <div className="simple-page"><div className="page-intro compact"><div><span className="section-kicker">YOUR CLOSET, IN MOTION</span><h1>My <em>rentals</em></h1><p>Everything you have borrowed, in one place.</p></div></div><div className="tabs"><button className="active">Upcoming <span>1</span></button><button>Active</button><button>Past</button></div><div className="rental-card"><img src={products[1].image} alt={products[1].name} /><div className="rental-body"><span className="status-pill"><span /> Confirmed</span><h2>{products[1].name}</h2><div className="rental-details"><div><span>Pickup</span><strong>Tomorrow · 4:00 PM</strong></div><div><span>Return</span><strong>Sunday · 6:00 PM</strong></div><div><span>Location</span><strong>Adyar, Chennai</strong></div></div><button className="outline-button">View details <ArrowUpRight size={15} /></button></div></div><div className="empty-rental"><span className="empty-ring"><Gem size={19} /></span><h2>Your next look is nearby.</h2><p>Find something special to borrow for your next plan.</p><button className="text-button" onClick={onExplore}>Explore nearby pieces <ArrowUpRight size={15} /></button></div></div> }

const EMPTY_DRAFT: Draft = { title: '', category: 'other', gender: 'women', occasions: [], style_tags: [], colors: [], formality: 3, description: '' }
type UploadPhase = 'empty' | 'analyzing' | 'ready' | 'manual' | 'not_clothing' | 'failed'

function ListItem({ areas, defaultArea, onPublished, onError }: { areas: string[]; defaultArea: string; onPublished: (listing: Listing) => void; onError: (message: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<UploadPhase>('empty')
  const [preview, setPreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [message, setMessage] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [terms, setTerms] = useState({ size: '' as Size | '', price: '', area: defaultArea, owner_name: storage.get('drape:owner_name', ''), owner_contact: storage.get('drape:owner_contact', '') })
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) { setPhase('failed'); setMessage('Please choose a photo (JPEG, PNG, WebP or HEIC).'); return }
    setPreview(URL.createObjectURL(file))
    setPhase('analyzing')
    setMessage('')
    setImageUrl(null)
    try {
      const result = await api.analyze(await downscaleImage(file))
      setImageUrl(result.image_url)
      setDraft(result.draft)
      setPhase('ready')
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'error'
      if (code === 'not_clothing') { setPhase('not_clothing'); setMessage('That doesn’t look like clothing. Try a photo of the outfit itself.'); return }
      const storedUrl = error instanceof ApiError && typeof error.body.image_url === 'string' ? error.body.image_url : null
      if (code === 'analysis_failed' && storedUrl) {
        // The AI couldn't read it, but the photo is saved: fall back to tagging by hand (PRD §13).
        setImageUrl(storedUrl)
        setDraft(EMPTY_DRAFT)
        setPhase('manual')
        setMessage('We couldn’t read this photo automatically — add the details yourself.')
        return
      }
      setPhase('failed')
      setMessage(error instanceof ApiError ? error.message : 'Upload failed. Please try again.')
    }
  }

  const editing = phase === 'ready' || phase === 'manual'
  const price = Number(terms.price)
  const missing = [
    draft.title.trim().length < 3 && 'a title',
    draft.occasions.length === 0 && 'an occasion',
    draft.colors.length === 0 && 'a colour',
    draft.description.trim().length < 10 && 'a description',
    !terms.size && 'a size',
    !(Number.isInteger(price) && price > 0) && 'a price',
    !terms.owner_name.trim() && 'your name',
    terms.owner_contact.trim().length < 3 && 'a contact',
  ].filter((item): item is string => Boolean(item))
  const canPublish = editing && imageUrl !== null && missing.length === 0 && !publishing

  const publish = async () => {
    if (!canPublish || !imageUrl || !terms.size) return
    setPublishing(true)
    try {
      const listing = await api.create({ ...draft, image_url: imageUrl, size: terms.size, price_per_day: price, area: terms.area, owner_name: terms.owner_name.trim(), owner_contact: terms.owner_contact.trim() })
      storage.set('drape:owner_name', terms.owner_name.trim())
      storage.set('drape:owner_contact', terms.owner_contact.trim())
      onPublished(listing)
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'Could not publish. Please try again.')
      setPublishing(false)
    }
  }

  const overlay = phase === 'analyzing' ? <div className="upload-overlay busy"><Gem size={16} /> Reading your photo…</div>
    : phase === 'ready' ? <div className="upload-overlay"><Check size={18} /> Tags ready — review them</div>
    : phase === 'manual' ? <div className="upload-overlay busy"><Check size={18} /> Photo saved — add details</div>
    : phase === 'not_clothing' ? <div className="upload-overlay error"><X size={16} /> That doesn’t look like clothing</div>
    : phase === 'failed' ? <div className="upload-overlay error"><X size={16} /> Upload failed — tap to retry</div> : null
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  return <div className="simple-page listing-page"><div className="page-intro compact"><div><span className="section-kicker">GIVE YOUR CLOSET A SECOND LIFE</span><h1>List a <em>piece</em></h1><p>AI will handle the details. You just set the terms.</p></div></div><div className="listing-flow">
    <div className={`upload-panel ${preview ? 'uploaded' : ''}`} onClick={() => phase !== 'analyzing' && fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click() }} aria-label="Choose a photo of the piece">
      <input ref={fileInput} className="hidden-input" type="file" accept="image/*,.heic,.heif" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = '' }} />
      {preview ? <><img src={preview} alt="Your piece" />{overlay}</> : <><span className="upload-icon"><ImagePlus size={24} /></span><h2>Drop in a photo</h2><p>We'll identify the piece and fill in the details.</p><span className="upload-link">Choose from device</span></>}
    </div>
    <div className="listing-form">
      <div className="form-step"><span>01</span><div><strong>AI detection</strong>
        <p>{phase === 'empty' ? 'Upload an image to get started' : phase === 'analyzing' ? 'Reading fabric, colour and occasion…' : editing ? (phase === 'manual' ? message : `${draft.title} · ${categoryLabel(draft.category)} — edit anything the AI got wrong`) : message}</p>
        {editing && <>
          <span className="field-label">Title</span><div className="explore-search field"><input value={draft.title} onChange={(event) => set({ title: event.target.value })} placeholder="e.g. Maroon silk saree with gold zari border" aria-label="Title" /></div>
          <div className="chip-row">
            <SelectChip label="Category" value={draft.category} options={CATEGORIES.map((c) => [c, categoryLabel(c)])} onChange={(category) => set({ category: category as Draft['category'] })} />
            <SelectChip label="For" value={draft.gender} options={GENDERS.map((g) => [g, titleCase(g)])} onChange={(gender) => set({ gender: gender as Draft['gender'] })} />
            <SelectChip label="Formality" value={String(draft.formality)} options={[1, 2, 3, 4, 5].map((f) => [String(f), `${f} / 5`])} onChange={(formality) => set({ formality: Number(formality) })} />
          </div>
          <span className="field-label">Occasions</span><ToggleChips options={OCCASIONS.map((o) => [o, occasionLabel(o)])} selected={draft.occasions} onChange={(occasions) => set({ occasions: occasions as Draft['occasions'] })} />
          <span className="field-label">Style</span><ChipEditor values={draft.style_tags} onChange={(style_tags) => set({ style_tags })} max={8} />
          <span className="field-label">Colours</span><ChipEditor values={draft.colors} onChange={(colors) => set({ colors })} max={5} />
          <span className="field-label">Description</span><div className="explore-search field"><textarea value={draft.description} onChange={(event) => set({ description: event.target.value })} placeholder="What it is, what it's best for, and where it doesn't fit" aria-label="Description" /></div>
        </>}
      </div><span className={editing ? 'step-done' : 'step-wait'}>{editing ? <Check size={14} /> : phase === 'analyzing' ? '…' : '—'}</span></div>
      <div className="form-step"><span>02</span><div><strong>Set your terms</strong>
        <p>{[terms.size && (terms.size === 'FREE' ? 'Free size' : `Size ${terms.size}`), price > 0 && `${rupees(price)} / day`, terms.area].filter(Boolean).join(' · ') || 'Size, price per day and where to pick it up'}</p>
        {editing && <>
          <span className="field-label">Size</span><ToggleChips single options={SIZES.map((s) => [s, s === 'FREE' ? 'Free size' : s])} selected={terms.size ? [terms.size] : []} onChange={([size]) => setTerms({ ...terms, size: (size ?? '') as Size | '' })} />
          <span className="field-label">Price per day</span><div className="explore-search field">₹<input inputMode="numeric" value={terms.price} onChange={(event) => setTerms({ ...terms, price: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="e.g. 650" aria-label="Price per day in rupees" /></div>
          <div className="chip-row"><SelectChip label="Pickup area" value={terms.area} options={areas.map((a) => [a, a])} onChange={(area) => setTerms({ ...terms, area })} /></div>
          <span className="field-label">Your name</span><div className="explore-search field"><input value={terms.owner_name} onChange={(event) => setTerms({ ...terms, owner_name: event.target.value })} placeholder="Shown on the listing" aria-label="Your name" /></div>
          <span className="field-label">Phone or email</span><div className="explore-search field"><input value={terms.owner_contact} onChange={(event) => setTerms({ ...terms, owner_contact: event.target.value })} placeholder="Only revealed when someone taps Show contact" aria-label="Phone or email" /></div>
        </>}
      </div><Settings size={16} /></div>
      <button className="primary-button full-width" disabled={!canPublish} onClick={publish}>{publishing ? 'Publishing…' : 'Publish item'} <ArrowUpRight size={17} /></button>
      {editing && missing.length > 0 && <p className="field-label">Still needed: {missing.join(', ')}</p>}
    </div></div>
    <div className="demand-note"><Gem size={17} /><div><strong>Live in search the moment you publish</strong><p>People nearby find your piece by describing what they need — no catalogue browsing.</p></div><ArrowUpRight size={17} /></div></div>
}

function SelectChip({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  const current = options.find(([v]) => v === value)?.[1] ?? value
  return <label className="suggestion has-select">{label}: {current} <ChevronDown size={12} /><select className="overlay-select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>
}

function ToggleChips({ options, selected, onChange, single = false }: { options: string[][]; selected: string[]; onChange: (values: string[]) => void; single?: boolean }) {
  const toggle = (value: string) => onChange(single ? (selected.includes(value) ? [] : [value]) : selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  return <div className="category-scroll inline">{options.map(([value, text]) => <button type="button" key={value} className={selected.includes(value) ? 'selected' : ''} aria-pressed={selected.includes(value)} onClick={() => toggle(value)}>{text}</button>)}</div>
}

function ChipEditor({ values, onChange, max }: { values: string[]; onChange: (values: string[]) => void; max: number }) {
  const [text, setText] = useState('')
  const add = () => {
    const value = text.trim().toLowerCase().replace(/,$/, '')
    if (value && !values.includes(value) && values.length < max) onChange([...values, value])
    setText('')
  }
  return <div className="category-scroll inline">{values.map((value) => <button type="button" className="selected" key={value} onClick={() => onChange(values.filter((v) => v !== value))} aria-label={`Remove ${value}`}>{value} <X size={11} /></button>)}{values.length < max && <input className="chip-input" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add() } }} onBlur={add} placeholder="+ add" aria-label="Add a tag" />}</div>
}

function Profile({ onPage }: { onPage: (page: Page) => void }) { return <div className="simple-page profile-page"><div className="profile-header"><div className="profile-avatar">AK</div><div><span className="section-kicker">YOUR DRAPE PROFILE</span><h1>Aditi <em>Krishnan</em></h1><p><MapPin size={14} /> Chennai · Member since 2024</p></div><button className="icon-button"><Settings size={18} /></button></div><div className="stats"><div><strong>08</strong><span>Items listed</span></div><div><strong>12</strong><span>Rentals</span></div><div><strong>₹24.8k</strong><span>Earned sharing</span></div></div><div className="profile-links">{[['wardrobe', 'My Wardrobe', '12 pieces in your closet'], ['list', 'My Listings', '4 active pieces'], ['rentals', 'My Rentals', '1 upcoming rental'], ['profile', 'Saved Items', `${3} pieces saved`]].map(([key, title, subtitle]) => <button key={key} onClick={() => onPage(key as Page)}><span className="link-icon"><Gem size={16} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronRight size={17} /></button>)}</div><div className="profile-foot"><button><Settings size={16} /> Settings</button><button>Help & support</button></div></div> }

function Wardrobe({ onExplore }: { onExplore: () => void }) { return <div className="simple-page wardrobe-page"><div className="page-intro compact"><div><span className="section-kicker">WHAT YOU ALREADY OWN</span><h1>My <em>wardrobe</em></h1><p>Build a look from what is yours, then fill the gaps nearby.</p></div></div><div className="wardrobe-summary"><div><strong>12</strong><span>Total pieces</span></div><div><strong>04</strong><span>Outfit ideas</span></div><button className="primary-button" onClick={onExplore}>Build an outfit <ArrowUpRight size={16} /></button></div><div className="wardrobe-grid">{products.slice(0, 4).map((product) => <div className="wardrobe-card" key={product.id}><img src={product.image} alt={product.name} /><div><strong>{product.name}</strong><span>{product.category} · {product.color}</span></div></div>)}</div><div className="demand-note"><Gem size={17} /><div><strong>You already have the trousers and shoes.</strong><p>You only need a blazer to complete your dinner look.</p></div><button className="text-button" onClick={onExplore}>Find nearby <ArrowUpRight size={15} /></button></div></div> }

export default App
