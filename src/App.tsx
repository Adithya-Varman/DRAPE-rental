import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowUpRight, Bell, Check, ChevronDown, ChevronRight, Heart, ImagePlus, MapPin,
  Menu, Mic, Plus, Search, Send, Settings, Sparkles as Gem, SlidersHorizontal, Star, UserRound, X,
} from 'lucide-react'
import type { Area, Draft, Listing, SearchResponse } from '../shared/contracts'
import { CATEGORIES, GENDERS, OCCASIONS, SIZES, type Size } from '../shared/vocab'
import { api, ApiError, type AppNotification, type Me } from './api'
import { addDays, overlaps, quote, todayInIndia, validateDates, MAX_DAYS_AHEAD, type Booking } from '../shared/booking'
import { categoryLabel, downscaleImage, formatDate, formatKm, formatRange, kmBetween, occasionLabel, rupees, storage, titleCase } from './lib'

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
  const [me, setMe] = useState<Me | null>(null)
  const [authFor, setAuthFor] = useState<string | null>(null) // why sign-in was asked for; null = not showing
  const [notes, setNotes] = useState<{ items: AppNotification[]; unread: number }>({ items: [], unread: 0 })
  const [bellOpen, setBellOpen] = useState(false)
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
  // Session lives in an httpOnly cookie; ask the server who we are. Also finish a Google sign-in redirect (?signed_in /
  // ?auth_error) and tidy the URL afterwards.
  useEffect(() => {
    api.me().then((r) => setMe(r.user)).catch(() => setMe(null))
    const params = new URLSearchParams(window.location.search)
    const error = params.get('auth_error')
    if (params.has('signed_in')) notify('Signed in with Google')
    if (error) notify(error === 'google_unverified' ? 'Your Google email isn’t verified yet.' : error === 'google_unavailable' ? 'Google sign-in isn’t set up yet — use email instead.' : 'Google sign-in didn’t work — please try again.')
    if (params.has('signed_in') || error) window.history.replaceState(null, '', window.location.pathname)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const loadNotes = useCallback(() => api.notifications().then((r) => setNotes({ items: r.notifications, unread: r.unread })).catch(() => undefined), [])
  // Owners hear about new bookings on the bell; poll while signed in (and whenever the tab regains focus).
  useEffect(() => {
    if (!me) return
    loadNotes()
    const timer = window.setInterval(loadNotes, 30_000)
    window.addEventListener('focus', loadNotes)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', loadNotes) }
  }, [me, loadNotes])

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
  const openListing = (id: string) => api.listing(id).then(openPiece).catch(() => notify('Couldn’t open that piece right now'))
  const onBooked = () => notify('Booked! The owner has been notified — details are in My Rentals')
  const askSignIn = (reason: string) => setAuthFor(reason)
  const openBell = () => {
    if (!me) return askSignIn('Sign in to see your notifications')
    const opening = !bellOpen
    setBellOpen(opening)
    if (opening && notes.unread > 0) { api.markRead().catch(() => undefined); window.setTimeout(() => setNotes((n) => ({ ...n, unread: 0 })), 1500) }
  }
  const signOut = async () => {
    await api.logout().catch(() => undefined)
    setMe(null); setNotes({ items: [], unread: 0 }); setBellOpen(false); setPage('ai'); notify('Signed out')
  }
  const viewRentals = () => { setSelected(null); setPage('rentals'); window.scrollTo(0, 0) }
  const searchContext = search.status === 'done' ? search.response.parsed : null

  const toastNode = toast && <div className="toast" role="status"><Check size={16} /> {toast}</div>
  if (authFor) return <><AuthPage reason={authFor} onDone={(user) => { setMe(user); setAuthFor(null); notify(`Welcome, ${user.name.split(' ')[0]}`) }} onCancel={() => setAuthFor(null)} />{toastNode}</>
  if (selected) return <><ProductDetail piece={selected} distance={distanceTo(selected)} area={area} context={searchContext} favorite={favorites.includes(selected.id)} onFavorite={() => toggleFavorite(selected.id)} onBack={() => setSelected(null)} me={me} onNeedAuth={() => askSignIn('Sign in to book')} onBooked={onBooked} onViewRentals={viewRentals} />{toastNode}</>

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
        <button className={`icon-button ${notes.unread ? 'has-badge' : ''}`} onClick={openBell} aria-label={notes.unread ? `${notes.unread} new notifications` : 'Notifications'} aria-expanded={bellOpen}><Bell size={17} />{notes.unread > 0 && <span className="bell-badge">{notes.unread}</span>}</button>
        <button className="avatar" onClick={() => me ? setPage('profile') : askSignIn('Sign in to list, book and get notified')} aria-label={me ? 'Your profile' : 'Sign in'}>{me ? initials(me.name) : <UserRound size={14} />}</button>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button>
      </div>
    </header>
    {bellOpen && me && <NotificationsPanel items={notes.items} onOpen={(id) => { setBellOpen(false); openListing(id) }} onClose={() => setBellOpen(false)} />}
    {menuOpen && <div className="mobile-nav">
      <div className="has-select"><button tabIndex={-1} aria-hidden="true"><MapPin size={13} /> {area} ▾</button><AreaSelect value={area} options={areaOptions} onChange={(next) => { changeArea(next); setMenuOpen(false) }} /></div>
      {(['ai', 'explore', 'rentals', 'list', 'profile'] as Page[]).map((item) => <button key={item} onClick={() => { setPage(item); setMenuOpen(false) }}>{item === 'ai' ? 'AI Stylist' : item === 'list' ? 'List Item' : item[0].toUpperCase() + item.slice(1)}</button>)}
      <button onClick={() => { setMenuOpen(false); if (me) openBell(); else askSignIn('Sign in to see your notifications') }}>Notifications{notes.unread ? ` (${notes.unread})` : ''}</button>
      {me ? <button onClick={() => { setMenuOpen(false); signOut() }}>Sign out</button> : <button onClick={() => { setMenuOpen(false); askSignIn('Sign in to list, book and get notified') }}>Sign in</button>}
    </div>}

    <main className="main-content">
      {page === 'ai' && <Home query={query} setQuery={setQuery} submitPrompt={submitPrompt} search={search} startOver={startOver} retry={() => search.status !== 'idle' && runSearch(search.turns)} filters={filters} setFilters={changeFilters} area={area} nearby={nearby ? byDistance(nearby).slice(0, 4) : null} distanceTo={distanceTo} favorites={favorites} toggleFavorite={toggleFavorite} onSelect={openPiece} onExplore={() => setPage('explore')} />}
      {page === 'explore' && <Explore area={area} byDistance={byDistance} distanceTo={distanceTo} favorites={favorites} toggleFavorite={toggleFavorite} onSelect={openPiece} />}
      {page === 'rentals' && <Rentals me={me} onSignIn={() => askSignIn('Sign in to see your rentals')} onExplore={() => setPage('explore')} onOpen={openListing} />}
      {page === 'list' && <ListItem me={me} onNeedAuth={() => askSignIn('Sign in to publish your piece')} areas={areaOptions} defaultArea={area} onPublished={(listing) => { notify('Your piece is live — it shows up in search right now'); setNearby((current) => [listing, ...(current ?? [])]); openPiece(listing) }} onError={notify} />}
      {page === 'profile' && <Profile me={me} favorites={favorites.length} onPage={setPage} onSignIn={() => askSignIn('Sign in to see your profile')} onSignOut={signOut} />}
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

function ProductDetail({ piece: initial, distance, area, context, favorite, onFavorite, onBack, me, onNeedAuth, onBooked, onViewRentals }: { piece: Piece; distance: number | null; area: string; context: SearchResponse['parsed'] | null; favorite: boolean; onFavorite: () => void; onBack: () => void; me: Me | null; onNeedAuth: () => void; onBooked: () => void; onViewRentals: () => void }) {
  const [piece, setPiece] = useState<Piece>(initial)
  const [booking, setBooking] = useState(false)
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
  return <div className="detail-page"><button className="back-button" onClick={onBack}><ArrowLeft size={16} /> {context ? 'Back to results' : 'Back'}</button><div className="detail-layout"><div className="detail-gallery"><img src={piece.image_url} alt={piece.title} /><div className="gallery-caption"><MapPin size={14} /> {km && km !== 'Nearby' ? `${km} from you · ${piece.area}` : `In ${piece.area}`}</div></div><div className="detail-info"><div className="detail-label">{categoryLabel(piece.category).toUpperCase()}{piece.style_tags[0] ? ` · ${piece.style_tags[0].toUpperCase()}` : ''}</div><h1>{piece.title}</h1><div className="detail-price"><strong>{rupees(piece.price_per_day)}</strong> / day</div><p className="detail-description">{piece.description}</p><div className="owner-row" role="button" tabIndex={0} aria-label="Show the owner's contact" onClick={() => contact.state !== 'shown' && contact.state !== 'loading' && revealContact()} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && contact.state !== 'shown') { event.preventDefault(); revealContact() } }}><div className="owner-avatar">{(piece.owner_name ?? '·')[0]}</div><div><strong>{piece.owner_name ?? 'Nearby owner'}</strong>
      <span>{contact.state === 'shown' && contact.value ? (contactHref ? <a href={contactHref} onClick={(event) => event.stopPropagation()}>{contact.value}</a> : contact.value) : contact.state === 'loading' ? 'Revealing contact…' : contact.state === 'error' ? 'Couldn’t load contact — tap to retry' : <>Nearby owner · {piece.area}{km && km !== 'Nearby' ? ` · ${km} away` : ''} · Tap to show contact</>}</span></div><ChevronRight size={17} /></div><div className="detail-actions">
    <button className="primary-button" onClick={() => setBooking(true)} aria-expanded={booking}>Book this piece <ArrowUpRight size={17} /></button>
    <button className={`save-button ${favorite ? 'saved' : ''}`} onClick={onFavorite}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? 'Saved' : 'Save'}</button></div>
    {booking && <BookingPanel piece={piece} me={me} onNeedAuth={onNeedAuth} onBooked={onBooked} onViewRentals={onViewRentals} />}
    {reasons.length > 0 && <div className="why-match"><div className="why-title"><Gem size={16} /> Why this matches you</div>{reasons.map((reason) => <div className="match-row" key={reason}><Check size={14} />{reason}</div>)}</div>}
    <div className="attributes"><h3>The details</h3><div className="attribute-grid">{[['Colour', piece.colors?.length ? piece.colors.map(titleCase).join(', ') : '—'], ['Size', piece.size === 'FREE' ? 'Free size' : piece.size], ['Category', categoryLabel(piece.category)], ['Occasion', piece.occasions.map(occasionLabel).join(', ') || '—'], ['Style', piece.style_tags.slice(0, 3).map(titleCase).join(', ') || '—'], ['Formality', piece.formality ? `${piece.formality} / 5` : '—']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div></div></div></div>
}

function BookingPanel({ piece, me, onNeedAuth, onBooked, onViewRentals }: { piece: Piece; me: Me | null; onNeedAuth: () => void; onBooked: () => void; onViewRentals: () => void }) {
  const today = todayInIndia()
  const [booked, setBooked] = useState<{ start_date: string; end_date: string }[]>([])
  const [form, setForm] = useState({ start: '', end: '', contact: storage.get('drape:borrower-contact', me?.email ?? ''), method: 'upi' as 'upi' | 'card' })
  const [status, setStatus] = useState<{ state: 'editing' | 'paying' | 'error'; message?: string } | { state: 'done'; booking: Booking }>({ state: 'editing' })
  useEffect(() => { api.availability(piece.id).then(setBooked).catch(() => setBooked([])) }, [piece.id])

  if (status.state === 'done') {
    const { booking } = status
    const contact = booking.listing.owner_contact
    const href = /@/.test(contact) ? `mailto:${contact}` : /^[+\d][\d\s-]{6,}$/.test(contact) ? `tel:${contact.replace(/[\s-]/g, '')}` : undefined
    return <div className="why-match booking-panel" aria-live="polite"><span className="status-pill"><span /> Confirmed</span>
      <div className="why-title booking-title"><Check size={16} /> You’re booked for {formatRange(booking.start_date, booking.end_date)}</div>
      <div className="match-row"><Check size={14} />Advance paid: {rupees(booking.advance)} · ref {booking.payment_ref}</div>
      <div className="match-row"><Check size={14} />Pay {rupees(booking.total - booking.advance)} to {booking.listing.owner_name} at pickup in {booking.listing.area}</div>
      <div className="detail-actions booking-actions">{href ? <a className="primary-button" href={href}>Contact {booking.listing.owner_name}: {contact} <ArrowUpRight size={17} /></a> : <span className="primary-button">{contact}</span>}<button className="outline-button" onClick={onViewRentals}>View in My Rentals <ArrowUpRight size={15} /></button></div>
    </div>
  }

  const datesChosen = Boolean(form.start && form.end)
  const dateProblem = datesChosen ? validateDates(form.start, form.end, today) ?? (booked.some((b) => overlaps(b, { start_date: form.start, end_date: form.end })) ? 'Those dates overlap an existing booking.' : null) : null
  const price = datesChosen && !dateProblem ? quote(piece.price_per_day, form.start, form.end) : null
  const ready = price && me && form.contact.trim().length >= 3 && status.state !== 'paying'

  const pay = async () => {
    if (!ready) return
    setStatus({ state: 'paying' })
    try {
      const { booking } = await api.book({ listing_id: piece.id, start_date: form.start, end_date: form.end, borrower_contact: form.contact.trim(), payment_method: form.method })
      storage.set('drape:borrower-contact', form.contact.trim())
      onBooked()
      setStatus({ state: 'done', booking })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { onNeedAuth(); setStatus({ state: 'editing' }); return }
      if (error instanceof ApiError && error.status === 409) api.availability(piece.id).then(setBooked).catch(() => undefined)
      setStatus({ state: 'error', message: error instanceof ApiError ? error.message : 'Payment didn’t go through. Please try again.' })
    }
  }

  return <div className="why-match booking-panel"><div className="why-title booking-title"><Gem size={16} /> Book this piece</div>
    {booked.length > 0 && <div className="match-row booked-row">Already booked: {booked.map((b) => formatRange(b.start_date, b.end_date)).join(', ')}</div>}
    <div className="chip-row booking-dates">
      <label><span className="field-label">Pickup</span><div className="explore-search field"><input type="date" value={form.start} min={today} max={addDays(today, MAX_DAYS_AHEAD)} onChange={(event) => setForm({ ...form, start: event.target.value, end: form.end && form.end >= event.target.value ? form.end : event.target.value })} aria-label="Pickup date" /></div></label>
      <label><span className="field-label">Return</span><div className="explore-search field"><input type="date" value={form.end} min={form.start || today} max={addDays(form.start || today, 13)} onChange={(event) => setForm({ ...form, end: event.target.value })} aria-label="Return date" /></div></label>
    </div>
    {dateProblem && <p className="field-label booking-error">{dateProblem}</p>}
    {me ? <p className="field-label">Booking as {me.name}</p> : <p className="field-label">You’ll sign in before paying so the owner knows who’s coming.</p>}
    <span className="field-label">Your phone or email</span><div className="explore-search field"><input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="Shared with the owner for pickup" aria-label="Your phone or email" /></div>
    {price && <div className="attribute-grid booking-quote">
      <div><span>Rent · {price.days} {price.days === 1 ? 'day' : 'days'} × {rupees(piece.price_per_day)}</span><strong>{rupees(price.total)}</strong></div>
      <div><span>Advance now (20%)</span><strong>{rupees(price.advance)}</strong></div>
      <div><span>Due at pickup</span><strong>{rupees(price.due_at_pickup)}</strong></div>
      <div><span>Pickup</span><strong>{piece.area}, {formatDate(form.start)}</strong></div>
    </div>}
    <span className="field-label">Pay with</span><ToggleChips single options={[['upi', 'UPI'], ['card', 'Card']]} selected={[form.method]} onChange={([method]) => method && setForm({ ...form, method: method as 'upi' | 'card' })} />
    {!me && <button className="primary-button full-width" onClick={onNeedAuth}>Sign in to book <ArrowUpRight size={17} /></button>}
    {me && <button className="primary-button full-width" disabled={!ready} onClick={pay}>{status.state === 'paying' ? 'Processing payment…' : price ? `Pay ${rupees(price.advance)} advance` : 'Choose your dates'} <ArrowUpRight size={17} /></button>}
    {status.state === 'error' && <p className="field-label booking-error" role="alert">{status.message}</p>}
    <p className="field-label">Demo payment — no real money moves. The owner is notified and their contact appears once you’re booked.</p>
  </div>
}

function Rentals({ me, onSignIn, onExplore, onOpen }: { me: Me | null; onSignIn: () => void; onExplore: () => void; onOpen: (listingId: string) => void }) {
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'active' | 'past'>('upcoming')
  useEffect(() => { if (!me) { setBookings([]); return } setBookings(null); api.myBookings().then(setBookings).catch(() => setBookings([])) }, [me])
  const today = todayInIndia()
  const groups = {
    upcoming: (bookings ?? []).filter((b) => b.start_date > today),
    active: (bookings ?? []).filter((b) => b.start_date <= today && b.end_date >= today),
    past: (bookings ?? []).filter((b) => b.end_date < today).reverse(),
  }
  const tabs: [typeof tab, string][] = [['upcoming', 'Upcoming'], ['active', 'Active'], ['past', 'Past']]
  return <div className="simple-page"><div className="page-intro compact"><div><span className="section-kicker">YOUR CLOSET, IN MOTION</span><h1>My <em>rentals</em></h1><p>Everything you have borrowed, in one place.</p></div></div><div className="tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}{groups[key].length > 0 && <span>{groups[key].length}</span>}</button>)}</div>
    {bookings === null && <div className="rental-card is-loading" aria-hidden="true"><div className="rental-body"><span className="status-pill">Loading your bookings…</span></div></div>}
    {groups[tab].map((b) => <div className="rental-card" key={b.id}><img src={b.listing.image_url} alt={b.listing.title} /><div className="rental-body"><span className="status-pill"><span /> {b.status === 'confirmed' ? (tab === 'past' ? 'Returned' : tab === 'active' ? 'With you now' : 'Confirmed') : 'Cancelled'}</span><h2>{b.listing.title}</h2><div className="rental-details"><div><span>Pickup</span><strong>{formatDate(b.start_date)}</strong></div><div><span>Return</span><strong>{formatDate(b.end_date)}</strong></div><div><span>Location</span><strong>{b.listing.area}, Chennai</strong></div><div><span>Owner</span><strong>{b.listing.owner_name} · {b.listing.owner_contact}</strong></div><div><span>Paid / due</span><strong>{rupees(b.advance)} / {rupees(b.total - b.advance)}</strong></div></div><button className="outline-button" onClick={() => onOpen(b.listing_id)}>View details <ArrowUpRight size={15} /></button></div></div>)}
    {!me ? <div className="empty-rental"><span className="empty-ring"><UserRound size={19} /></span><h2>Sign in to see your rentals.</h2><p>Your bookings follow your account across devices.</p><button className="text-button" onClick={onSignIn}>Sign in <ArrowUpRight size={15} /></button></div> : <div className="empty-rental"><span className="empty-ring"><Gem size={19} /></span><h2>{bookings !== null && groups[tab].length === 0 ? (tab === 'upcoming' ? 'No upcoming rentals yet.' : tab === 'active' ? 'Nothing with you right now.' : 'No past rentals yet.') : 'Your next look is nearby.'}</h2><p>Find something special to borrow for your next plan.</p><button className="text-button" onClick={onExplore}>Explore nearby pieces <ArrowUpRight size={15} /></button></div>}</div>
}

const EMPTY_DRAFT: Draft = { title: '', category: 'other', gender: 'women', occasions: [], style_tags: [], colors: [], formality: 3, description: '' }
type UploadPhase = 'empty' | 'analyzing' | 'ready' | 'manual' | 'not_clothing' | 'failed'

function ListItem({ me, onNeedAuth, areas, defaultArea, onPublished, onError }: { me: Me | null; onNeedAuth: () => void; areas: string[]; defaultArea: string; onPublished: (listing: Listing) => void; onError: (message: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<UploadPhase>('empty')
  const [preview, setPreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [message, setMessage] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [terms, setTerms] = useState({ size: '' as Size | '', price: '', area: defaultArea, owner_name: storage.get('drape:owner_name', me?.name ?? ''), owner_contact: storage.get('drape:owner_contact', '') })
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

  useEffect(() => { if (me && !terms.owner_name) setTerms((t) => ({ ...t, owner_name: me.name })) }, [me])  // eslint-disable-line react-hooks/exhaustive-deps
  const publish = async () => {
    if (!me) { onNeedAuth(); return }
    if (!canPublish || !imageUrl || !terms.size) return
    setPublishing(true)
    try {
      const listing = await api.create({ ...draft, image_url: imageUrl, size: terms.size, price_per_day: price, area: terms.area, owner_name: terms.owner_name.trim(), owner_contact: terms.owner_contact.trim() })
      storage.set('drape:owner_name', terms.owner_name.trim())
      storage.set('drape:owner_contact', terms.owner_contact.trim())
      onPublished(listing)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { onNeedAuth(); setPublishing(false); return }
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
      <button className="primary-button full-width" disabled={!canPublish} onClick={publish}>{publishing ? 'Publishing…' : me ? 'Publish item' : 'Sign in & publish'} <ArrowUpRight size={17} /></button>
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

function Profile({ me, favorites, onPage, onSignIn, onSignOut }: { me: Me | null; favorites: number; onPage: (page: Page) => void; onSignIn: () => void; onSignOut: () => void }) {
  const [stats, setStats] = useState<{ listed: number; rentals: number; earned: number } | null>(null)
  useEffect(() => { if (me) api.me().then((r) => setStats(r.stats)).catch(() => setStats(null)) }, [me])
  if (!me) return <div className="simple-page profile-page"><div className="empty-rental"><span className="empty-ring"><UserRound size={19} /></span><h2>Your DRAPE profile</h2><p>Sign in to list pieces, book outfits and get notified when someone books yours.</p><button className="text-button" onClick={onSignIn}>Sign in or create an account <ArrowUpRight size={15} /></button></div></div>
  const [first, ...rest] = me.name.split(' ')
  const earned = stats ? (stats.earned >= 1000 ? `₹${(stats.earned / 1000).toFixed(1)}k` : rupees(stats.earned)) : '—'
  return <div className="simple-page profile-page"><div className="profile-header"><div className="profile-avatar">{initials(me.name)}</div><div><span className="section-kicker">YOUR DRAPE PROFILE</span><h1>{first} {rest.length > 0 && <em>{rest.join(' ')}</em>}</h1><p><MapPin size={14} /> Chennai · {me.email}</p></div><button className="icon-button" aria-label="Settings"><Settings size={18} /></button></div><div className="stats"><div><strong>{stats ? String(stats.listed).padStart(2, '0') : '—'}</strong><span>Items listed</span></div><div><strong>{stats ? String(stats.rentals).padStart(2, '0') : '—'}</strong><span>Rentals</span></div><div><strong>{earned}</strong><span>Earned sharing</span></div></div><div className="profile-links">{([['rentals', 'My Rentals', stats ? `${stats.rentals} ${stats.rentals === 1 ? 'booking' : 'bookings'}` : 'Your bookings'], ['list', 'List a piece', stats ? `${stats.listed} ${stats.listed === 1 ? 'piece' : 'pieces'} listed so far` : 'Earn from your wardrobe'], ['explore', 'Saved Items', `${favorites} ${favorites === 1 ? 'piece' : 'pieces'} saved`], ['wardrobe', 'My Wardrobe', 'Plan looks from what you own']] as [Page, string, string][]).map(([key, title, subtitle]) => <button key={title} onClick={() => onPage(key)}><span className="link-icon"><Gem size={16} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronRight size={17} /></button>)}</div><div className="profile-foot"><button><Settings size={16} /> Settings</button><button>Help & support</button><button onClick={onSignOut}><UserRound size={16} /> Sign out</button></div></div>
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '·'

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : formatDate(iso.slice(0, 10))
}

function NotificationsPanel({ items, onOpen, onClose }: { items: AppNotification[]; onOpen: (listingId: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="notifications-panel" role="dialog" aria-label="Notifications"><div className="ai-response-head"><span className="ai-avatar"><Bell size={13} /></span><span>NOTIFICATIONS</span><button className="response-label" onClick={onClose} aria-label="Close notifications"><X size={14} /></button></div>
    {items.length === 0 && <p className="notification-empty">No notifications yet. When someone books one of your pieces, you’ll see it here with their contact.</p>}
    {items.map((n) => n.booking && <button className={`notification-item ${n.read_at ? '' : 'unread'}`} key={n.id} onClick={() => onOpen(n.booking!.listing.id)}>
      <img src={n.booking.listing.image_url} alt="" />
      <span><strong>{n.booking.borrower_name} booked your {n.booking.listing.title}</strong>
        <small>{formatRange(n.booking.start_date, n.booking.end_date)} · {rupees(n.booking.advance)} advance paid · {rupees(n.booking.total - n.booking.advance)} due at pickup</small>
        <small>Contact: {n.booking.borrower_contact}</small>
        <small className="notification-time">{timeAgo(n.created_at)}</small></span>
    </button>)}
  </div>
}

function AuthPage({ reason, onDone, onCancel }: { reason: string; onDone: (user: Me) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [status, setStatus] = useState<{ busy: boolean; error?: string }>({ busy: false })
  const [google, setGoogle] = useState(false)
  useEffect(() => { api.providers().then((p) => setGoogle(p.google)).catch(() => setGoogle(false)) }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const email = form.email.trim()
    if (mode === 'signup' && !form.name.trim()) return setStatus({ busy: false, error: 'Add your name so owners know who’s booking.' })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setStatus({ busy: false, error: 'That doesn’t look like an email address.' })
    if (mode === 'signup' && form.password.length < 8) return setStatus({ busy: false, error: 'Passwords need at least 8 characters.' })
    if (!form.password) return setStatus({ busy: false, error: 'Enter your password.' })
    setStatus({ busy: true })
    try {
      const user = mode === 'signup'
        ? await api.signup({ name: form.name.trim(), email, password: form.password })
        : await api.login({ email, password: form.password })
      onDone(user)
    } catch (error) {
      setStatus({ busy: false, error: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' })
    }
  }
  return <div className="app-shell"><div className="simple-page auth-page"><button className="back-button" onClick={onCancel}><ArrowLeft size={16} /> Back</button><div className="page-intro compact"><div><span className="section-kicker">{reason.toUpperCase()}</span><h1>{mode === 'signin' ? <>Welcome <em>back</em></> : <>Join <em>DRAPE</em></>}</h1><p>{mode === 'signin' ? 'Sign in to book pieces, list your own and get notified.' : 'One account to borrow nearby and earn from your wardrobe.'}</p></div></div>
    <form className="auth-form" onSubmit={submit} noValidate>
      {google && <><a className="outline-button full-width google-button" href="/api/auth/google"><GoogleMark /> Continue with Google</a><p className="field-label auth-or">or use your email</p></>}
      {mode === 'signup' && <><span className="field-label">Your name</span><div className="explore-search field"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" placeholder="Shown to owners and borrowers" aria-label="Your name" /></div></>}
      <span className="field-label">Email</span><div className="explore-search field"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" placeholder="you@example.com" aria-label="Email" /></div>
      <span className="field-label">Password</span><div className="explore-search field"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} aria-label="Password" /></div>
      {status.error && <p className="field-label booking-error" role="alert">{status.error}</p>}
      <button className="primary-button full-width" type="submit" disabled={status.busy}>{status.busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowUpRight size={17} /></button>
      <button type="button" className="text-button auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setStatus({ busy: false }) }}>{mode === 'signin' ? 'New to DRAPE? Create an account' : 'Already have an account? Sign in'} <ArrowUpRight size={15} /></button>
    </form></div></div>
}

// Google's "G" mark, as the brand guidelines ask for on a sign-in button.
function GoogleMark() {
  return <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
}

function Wardrobe({ onExplore }: { onExplore: () => void }) { return <div className="simple-page wardrobe-page"><div className="page-intro compact"><div><span className="section-kicker">WHAT YOU ALREADY OWN</span><h1>My <em>wardrobe</em></h1><p>Build a look from what is yours, then fill the gaps nearby.</p></div></div><div className="wardrobe-summary"><div><strong>12</strong><span>Total pieces</span></div><div><strong>04</strong><span>Outfit ideas</span></div><button className="primary-button" onClick={onExplore}>Build an outfit <ArrowUpRight size={16} /></button></div><div className="wardrobe-grid">{products.slice(0, 4).map((product) => <div className="wardrobe-card" key={product.id}><img src={product.image} alt={product.name} /><div><strong>{product.name}</strong><span>{product.category} · {product.color}</span></div></div>)}</div><div className="demand-note"><Gem size={17} /><div><strong>You already have the trousers and shoes.</strong><p>You only need a blazer to complete your dinner look.</p></div><button className="text-button" onClick={onExplore}>Find nearby <ArrowUpRight size={15} /></button></div></div> }

export default App
