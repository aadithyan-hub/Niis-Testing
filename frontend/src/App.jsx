// Throwaway tester for NIIS APIs: social media publishing (sheet row 57),
// the media library (gap #26, in MediaLibrary.jsx) and the mobile apps'
// reCAPTCHA check (MobileRecaptcha.jsx).
// Not production code: plain Tailwind, no routing.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { makeApi } from './api.js'
import InstagramSim from './InstagramSim.jsx'
import MediaLibrary from './MediaLibrary.jsx'
import MobileRecaptcha from './MobileRecaptcha.jsx'

const DEFAULT_BASE = 'http://127.0.0.1:8001'

function Section({ title, children, right }) {
  return (
    <section className="border border-gray-300 rounded p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Btn({ children, className = '', ...props }) {
  return (
    <button
      className={`px-3 py-1 rounded border border-gray-400 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-sm ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

const input = 'border border-gray-400 rounded px-2 py-1 text-sm w-full'

function Badge({ value }) {
  const colors = {
    valid: 'bg-green-100 text-green-800', published: 'bg-green-100 text-green-800',
    expiring: 'bg-yellow-100 text-yellow-800', scheduled: 'bg-blue-100 text-blue-800',
    publishing: 'bg-blue-100 text-blue-800', pending_review: 'bg-yellow-100 text-yellow-800',
    invalid: 'bg-red-100 text-red-800', failed: 'bg-red-100 text-red-800',
  }
  return <span className={`px-2 py-0.5 rounded text-xs ${colors[value] || 'bg-gray-100 text-gray-700'}`}>{value}</span>
}

function useAction(setMessage) {
  const [busy, setBusy] = useState(false)
  const run = async (fn, okText) => {
    setBusy(true)
    try {
      const result = await fn()
      if (okText) setMessage({ ok: true, text: okText })
      return result
    } catch (e) {
      setMessage({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }
  return [busy, run]
}

// Users made by backend\seed_media.py (password Test@12345, admin: admin@123).
const MEDIA_USERS = ['admin', 'editor1', 'dpro_kohima', 'apro_kohima', 'dpro_dimapur',
  'fo_kohima', 'fo_kohima2', 'ia_dimapur', 'fo_none', 'analyst']

// ── Login ───────────────────────────────────────────────────────────────────
function Login({ api, user, onLogin, onLogout, setMessage, tab }) {
  const [username, setUsername] = useState('testeditor')
  const [password, setPassword] = useState('Test@12345')
  const [busy, run] = useAction(setMessage)

  const login = (name = username, pass = password) => run(async () => {
    const data = await api('POST', '/api/v1/auth/login/', {
      username: name, password: pass, captcha_token: 'local-test',
    })
    if (data.mfa_required) throw new Error('This user has MFA on; use a test user without MFA.')
    // The login response's user has no username; keep the one typed.
    onLogin(data.access_token, { ...(data.user || {}), username: data.user?.username || name })
  }, `Logged in as ${name}`)

  const quick = tab === 'media'
    ? MEDIA_USERS.map(name => [name, name === 'admin' ? 'admin@123' : 'Test@12345'])
    : [['testadmin', 'Test@12345'], ['testeditor', 'Test@12345']]

  if (user) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Logged in as <b>{user.username || user.id}</b> ({user.role})</span>
        <Btn onClick={onLogout}>Log out</Btn>
        {tab === 'media' && <span className="text-gray-500">switch to:</span>}
        {tab === 'media' && quick.filter(([name]) => name !== user.username).map(([name, pass]) => (
          <Btn key={name} disabled={busy} onClick={() => login(name, pass)}>{name}</Btn>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label>Username<input className={input} value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label>Password<input className={input} type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <Btn disabled={busy} onClick={() => login()}>Log in</Btn>
      {quick.map(([name, pass]) => (
        <Btn key={name} disabled={busy} onClick={() => login(name, pass)}>as {name}</Btn>
      ))}
    </div>
  )
}

function PlatformBadge({ value }) {
  const colors = { facebook: 'bg-blue-100 text-blue-900', instagram: 'bg-pink-100 text-pink-900' }
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[value] || 'bg-gray-100'}`}>{value}</span>
}

const isSimAccount = account => account?.platform === 'instagram' && (account.page_name || '').includes('simulated')

// ── Connected accounts (admin) ──────────────────────────────────────────────
function Accounts({ api, accounts, reload, setMessage, sim }) {
  const [platform, setPlatform] = useState('facebook')
  const [pageId, setPageId] = useState('')
  const [token, setToken] = useState('')
  const [busy, run] = useAction(setMessage)
  const instagram = platform === 'instagram'

  const connect = () => run(async () => {
    await api('POST', '/api/v1/admin/social/accounts/', { platform, page_id: pageId.trim(), access_token: token.trim() })
    setToken('')
    await reload()
  }, instagram ? 'Instagram account connected' : 'Page connected')

  const act = (fn, text) => run(async () => { await fn(); await reload() }, text)

  return (
    <Section title="1. Connected accounts: Facebook Pages and Instagram (admin)" right={<Btn onClick={reload}>Reload</Btn>}>
      {accounts === null && <p className="text-sm text-gray-600">Log in as <b>testadmin</b> to manage accounts (editors get 403 here).</p>}
      {accounts && accounts.length === 0 && <p className="text-sm text-gray-600">No account connected yet.</p>}
      {accounts && accounts.length > 0 && (
        <table className="w-full text-sm mb-4">
          <thead><tr className="text-left border-b"><th>Platform</th><th>Account</th><th>Token</th><th>Expires</th><th>Active</th><th>Last error</th><th></th></tr></thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className="border-b align-top">
                <td className="py-1"><PlatformBadge value={a.platform} />{isSimAccount(a) && <div className="text-xs text-gray-500">simulated</div>}</td>
                <td className="py-1">{a.page_name || '-'}<div className="text-xs text-gray-500">{a.page_id}</div></td>
                <td><Badge value={a.token_status} /></td>
                <td className="text-xs">{a.token_expires_at ? new Date(a.token_expires_at).toLocaleString() : 'never / unknown'}</td>
                <td>{a.is_active ? 'yes' : 'no'}</td>
                <td className="text-xs text-red-700 max-w-xs">{a.last_error}</td>
                <td className="space-x-1 whitespace-nowrap">
                  <Btn disabled={busy} onClick={() => act(() => api('POST', `/api/v1/admin/social/accounts/${a.id}/verify/`), 'Token checked')}>Verify</Btn>
                  {a.is_active
                    ? <Btn disabled={busy} onClick={() => act(() => api('DELETE', `/api/v1/admin/social/accounts/${a.id}/`), 'Deactivated')}>Deactivate</Btn>
                    : <Btn disabled={busy} onClick={() => act(() => api('PATCH', `/api/v1/admin/social/accounts/${a.id}/`, { is_active: true }), 'Activated')}>Activate</Btn>}
                  <Btn disabled={busy} onClick={() => {
                    const t = window.prompt(a.platform === 'instagram'
                      ? 'New token (user token of a Page manager, or the linked Page token; SIM-... for the simulated account)'
                      : 'New access token (Page token or user token)')
                    if (t) act(() => api('PATCH', `/api/v1/admin/social/accounts/${a.id}/`, { access_token: t.trim() }), 'Token replaced')
                  }}>Replace token</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {accounts !== null && (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <label>Platform
              <select className={input} value={platform} onChange={e => setPlatform(e.target.value)}>
                <option value="facebook">Facebook Page</option>
                <option value="instagram">Instagram account</option>
              </select>
            </label>
            <label>{instagram ? 'Instagram account ID' : 'Page ID'}
              <input className={input} value={pageId} onChange={e => setPageId(e.target.value)} placeholder={instagram ? '17841400000000000' : '1340308269168285'} />
            </label>
            <label>{instagram ? 'Token (user token of a Page manager, or the linked Page token)' : 'Access token (Page or user token)'}
              <input className={input} type={_isSim(token) ? 'text' : 'password'} value={token} onChange={e => setToken(e.target.value)} />
            </label>
            <Btn disabled={busy || !pageId || !token} onClick={connect}>{instagram ? 'Connect Instagram account' : 'Connect Page'}</Btn>
          </div>
          {instagram && (
            <div className="p-2 bg-pink-50 border border-pink-200 rounded text-xs space-y-1">
              <div><b>Simulated account</b> (nothing leaves this computer): ID <code>{sim?.sim_ig_id || '...'}</code> with a token from section 4, e.g. <code>SIM-USER</code>.
                {sim && <Btn className="ml-2" onClick={() => { setPageId(sim.sim_ig_id); setToken('SIM-USER') }}>Fill simulated</Btn>}
              </div>
              <div><b>Real account</b>: connect and Verify go to the real Meta (this computer must reach graph.facebook.com). Posting to a real account is <b>blocked by this tester</b> and never sent.</div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

function _isSim(token) { return token.trim().startsWith('SIM') }

// ── Content + "Post to Facebook / Instagram" ────────────────────────────────
// Editors cannot list accounts (403), so the post form also takes a pasted id.
function PostForm({ api, content, accounts, onDone, setMessage, storageBase }) {
  const [accountId, setAccountId] = useState('')
  const [message, setMsg] = useState('')
  const [when, setWhen] = useState('')
  const [includeImage, setIncludeImage] = useState(true)
  const [imageUrl, setImageUrl] = useState('')
  const [busy, run] = useAction(setMessage)

  const account = (accounts || []).find(a => a.id === accountId)
  const instagram = account?.platform === 'instagram'
  const image = includeImage ? (imageUrl.trim() || content.featured_image_url || '') : ''
  const outside = image && storageBase && !image.startsWith(storageBase)
  const target = account ? (instagram ? 'Instagram' : 'Facebook') : 'social media'

  const submit = () => run(async () => {
    const body = { include_image: includeImage }
    if (accountId) body.account_id = accountId
    if (message.trim()) body.message = message.trim()
    if (when) body.scheduled_at = new Date(when).toISOString()
    if (imageUrl.trim()) body.image_url = imageUrl.trim()
    const post = await api('POST', `/api/v1/admin/cms/content/${content.id}/social-posts/`, body)
    onDone()
    return post
  }, 'Post created - see "Social posts" below for its status')

  return (
    <div className="mt-3 p-3 border border-dashed border-gray-400 rounded text-sm space-y-2">
      <div className="font-medium">Post "{content.title}" to {target}</div>
      <div className="flex gap-3 items-start">
        {content.featured_image_url
          ? <a href={content.featured_image_url} target="_blank" rel="noreferrer"><img src={content.featured_image_url} alt="" className="h-20 border bg-gray-100" /></a>
          : <div className="h-20 w-20 border bg-gray-100 text-xs text-gray-500 flex items-center justify-center text-center">no featured image</div>}
        <div className="text-xs text-gray-600 break-all">{content.featured_image_url || ''}</div>
      </div>
      <label className="block">Account
        <select className={input} value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">(no account_id: the only active account, or the one active Facebook Page)</option>
          {(accounts || []).filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.platform}: {a.page_name || a.page_id}</option>)}
        </select>
      </label>
      {accounts === null && (
        <label className="block">Account id (editors cannot list accounts: paste it, or leave empty)
          <input className={input} value={accountId} onChange={e => setAccountId(e.target.value.trim())} placeholder="uuid from section 1, as testadmin" />
        </label>
      )}
      {instagram && (
        <div className="p-2 bg-pink-50 border border-pink-200 rounded text-xs space-y-1">
          <div>Instagram: an image is required; the server posts an Instagram-ready JPEG copy (padded, never cropped). The link goes into the caption as text. Caption is cut to 2,200 characters.</div>
          {!image && <div className="text-red-700 font-medium">No image: the API will refuse this (400). That is expected.</div>}
          {outside && <div className="text-red-700 font-medium">The image is not in NIIS storage: the API will refuse this (400). That is expected.</div>}
          {!isSimAccount(account) && <div className="text-red-700 font-medium">Real Instagram account: the tester blocks the send, the post ends as failed with "Blocked by the local tester". Nothing reaches Instagram.</div>}
        </div>
      )}
      <label className="block">Message (empty = title + summary; the link is added by the backend)
        <textarea className={input} rows={3} value={message} onChange={e => setMsg(e.target.value)} />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label>Schedule (empty = now / when published)
          <input className={input} type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
        </label>
        <label>Image URL override (must be from /api/v1/media/upload/)
          <input className={input} value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={includeImage} onChange={e => setIncludeImage(e.target.checked)} /> Include image (featured image)
      </label>
      <Btn disabled={busy} onClick={submit} className={instagram ? 'bg-pink-600! text-white! border-pink-700!' : 'bg-blue-600! text-white! border-blue-700!'}>Post to {target}</Btn>
    </div>
  )
}

function Contents({ api, accounts, onPosted, setMessage, storageBase }) {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, run] = useAction(setMessage)

  const load = useCallback(() => run(async () => {
    const data = await api('GET', '/api/v1/admin/cms/content/?page_size=20')
    setItems(data.results || data)
  }), [api]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const approve = c => run(async () => {
    await api('POST', `/api/v1/admin/cms/content/${c.id}/approve/`, { action: 'approve', comments: 'Approved from the test app' })
    await load()
    onPosted()
  }, 'Approved and published - a waiting social post should now go out')

  return (
    <Section title="2. Content" right={<Btn onClick={load}>Reload</Btn>}>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Image</th><th>Title</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {items.map(c => (
            <tr key={c.id} className={`border-b ${selected?.id === c.id ? 'bg-blue-50' : ''}`}>
              <td className="py-1 w-16">
                {c.featured_image_url
                  ? <img src={c.featured_image_url} alt="" className="h-10 max-w-14 border bg-gray-100" title={c.featured_image_url} />
                  : <span className="text-xs text-gray-400">none</span>}
              </td>
              <td className="py-1">{c.title}<div className="text-xs text-gray-500">{c.slug}</div></td>
              <td><Badge value={c.status} /></td>
              <td className="space-x-1 whitespace-nowrap text-right">
                <Btn onClick={() => setSelected(selected?.id === c.id ? null : c)}>{selected?.id === c.id ? 'Close' : 'Post...'}</Btn>
                {c.status === 'pending_review' && <Btn disabled={busy} onClick={() => approve(c)}>Approve (editor)</Btn>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && <PostForm key={selected.id} api={api} content={selected} accounts={accounts} onDone={onPosted} setMessage={setMessage} storageBase={storageBase} />}
    </Section>
  )
}

// ── Social posts ────────────────────────────────────────────────────────────
function Posts({ api, refreshKey, setMessage }) {
  const [posts, setPosts] = useState([])
  const [status, setStatus] = useState('')
  const [auto, setAuto] = useState(true)
  const [, run] = useAction(setMessage)

  const load = useCallback(async () => {
    try {
      const data = await api('GET', `/api/v1/admin/social/posts/${status ? `?status=${status}` : ''}`)
      setPosts(data.results || data)
    } catch (e) {
      setMessage({ ok: false, text: e.message })
    }
  }, [api, status, setMessage])

  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    if (!auto) return undefined
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [auto, load])

  const act = (method, path, text) => run(async () => { await api(method, path); await load() }, text)

  return (
    <Section title="3. Social posts" right={
      <div className="flex items-center gap-2 text-sm">
        <select className="border border-gray-400 rounded px-1" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">all</option>
          {['scheduled', 'publishing', 'published', 'failed', 'cancelled'].map(s => <option key={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> auto-refresh 5s</label>
        <Btn onClick={load}>Reload</Btn>
      </div>
    }>
      {posts.length === 0 && <p className="text-sm text-gray-600">No posts yet.</p>}
      {posts.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th>Platform</th><th>Content</th><th>Status</th><th>When</th><th>Post</th><th>Reactions (likes) / comments / shares</th><th></th></tr></thead>
          <tbody>
            {posts.map(p => (
              <tr key={p.id} className="border-b align-top">
                <td className="py-1"><PlatformBadge value={p.platform} /></td>
                <td className="py-1">{p.content_title}<div className="text-xs text-gray-500">{p.page_name}</div></td>
                <td>
                  <Badge value={p.status} />
                  <div className="text-xs">attempts: {p.attempts}</div>
                  {p.error && <div className="text-xs text-red-700 max-w-xs">{p.error}</div>}
                </td>
                <td className="text-xs">
                  {p.published_at && <div>posted {new Date(p.published_at).toLocaleString()}</div>}
                  {!p.published_at && p.scheduled_at && <div>scheduled {new Date(p.scheduled_at).toLocaleString()}</div>}
                  {!p.published_at && !p.scheduled_at && p.status === 'scheduled' && <div>waits for publication</div>}
                  {p.next_attempt_at && <div>retry at {new Date(p.next_attempt_at).toLocaleString()}</div>}
                </td>
                <td className="text-xs">
                  {p.permalink ? <a className="text-blue-700 underline" href={p.permalink} target="_blank" rel="noreferrer">open post</a> : '-'}
                  {p.external_id.startsWith('SIMM-') && <div className="text-pink-700">simulated - not on Instagram</div>}
                  <div className="text-gray-500">{p.external_id}</div>
                </td>
                <td className="text-xs">
                  {p.metrics_updated_at
                    ? `${p.reactions_count ?? 'n/a'} / ${p.comments_count ?? 'n/a'} / ${p.shares_count ?? 'n/a'}`
                    : 'not fetched yet'}
                  {p.platform === 'instagram' && <div className="text-gray-500">Instagram: likes / comments, no shares</div>}
                </td>
                <td className="whitespace-nowrap space-x-1">
                  {p.status === 'scheduled' && <Btn onClick={() => act('DELETE', `/api/v1/admin/cms/content/${p.content_id}/social-posts/${p.id}/`, 'Cancelled')}>Cancel</Btn>}
                  {p.status === 'failed' && <Btn onClick={() => act('POST', `/api/v1/admin/cms/content/${p.content_id}/social-posts/${p.id}/retry/`, 'Retrying')}>Retry</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

// ── Request log ─────────────────────────────────────────────────────────────
function Log({ entries, clear }) {
  return (
    <Section title="API log (last 30 calls)" right={<Btn onClick={clear}>Clear</Btn>}>
      <div className="space-y-1 max-h-96 overflow-auto text-xs font-mono">
        {entries.map((e, i) => (
          <details key={i} className="border-b">
            <summary className={typeof e.status === 'number' && e.status < 400 ? '' : 'text-red-700'}>
              {e.time} {e.method} {e.path} → {e.status}
            </summary>
            <pre className="whitespace-pre-wrap bg-gray-50 p-2">{JSON.stringify(e.data, null, 2)}</pre>
          </details>
        ))}
      </div>
    </Section>
  )
}

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [base, setBase] = useState(() => localStorage.getItem('niis-base') || DEFAULT_BASE)
  const [token, setToken] = useState(() => localStorage.getItem('niis-token') || '')
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('niis-user') || 'null'))
  const [log, setLog] = useState([])
  const [message, setMessage] = useState(null)
  const [accounts, setAccounts] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [sim, setSim] = useState(null)
  const [tab, setTab] = useState(() => localStorage.getItem('niis-tab') || 'media')

  useEffect(() => { localStorage.setItem('niis-tab', tab) }, [tab])

  const onLog = useCallback(entry => setLog(old => [entry, ...old].slice(0, 30)), [])
  const api = useMemo(() => makeApi(base, token, onLog), [base, token, onLog])

  useEffect(() => { localStorage.setItem('niis-base', base) }, [base])

  const onLogin = (accessToken, u) => {
    setToken(accessToken); setUser(u)
    localStorage.setItem('niis-token', accessToken); localStorage.setItem('niis-user', JSON.stringify(u))
  }
  const onLogout = () => {
    setToken(''); setUser(null); setAccounts(null)
    localStorage.removeItem('niis-token'); localStorage.removeItem('niis-user')
  }

  const loadAccounts = useCallback(async () => {
    if (!token || tab !== 'social') return
    try {
      setAccounts(await api('GET', '/api/v1/admin/social/accounts/'))
    } catch {
      setAccounts(null)   // editors get 403 - that is expected
    }
  }, [api, token, tab])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  return (
    <div className="min-h-screen bg-gray-50 p-4 space-y-4 max-w-6xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-xl font-bold">NIIS API Tester <span className="text-sm font-normal text-gray-500">(local testing only - own database and storage, never production)</span></h1>
        <div className="flex gap-1">
          {[['media', 'Media library (#26)'], ['social', 'Social posting (row 57)'], ['recaptcha', 'Mobile reCAPTCHA']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setMessage(null) }}
              className={`px-3 py-1 rounded-t border text-sm ${tab === key ? 'bg-white border-gray-400 border-b-white font-medium' : 'bg-gray-100 border-gray-300'}`}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">API base
          <input className="border border-gray-400 rounded px-2 py-1 w-72" value={base} onChange={e => setBase(e.target.value)} />
        </label>
        {tab !== 'recaptcha' && <Login api={api} user={user} onLogin={onLogin} onLogout={onLogout} setMessage={setMessage} tab={tab} />}
        {message && (
          <div className={`text-sm p-2 rounded ${message.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
            {message.text} <button className="ml-2 underline" onClick={() => setMessage(null)}>dismiss</button>
          </div>
        )}
      </header>

      {token && tab === 'media' && <MediaLibrary key={token} api={api} base={base} token={token} user={user} setMessage={setMessage} />}
      {token && tab === 'social' && (
        <>
          <Accounts api={api} accounts={accounts} reload={loadAccounts} setMessage={setMessage} sim={sim} />
          <Contents api={api} accounts={accounts} onPosted={() => setRefreshKey(k => k + 1)} setMessage={setMessage} storageBase={sim?.storage_base} />
          <Posts api={api} refreshKey={refreshKey} setMessage={setMessage} />
          <InstagramSim api={api} onChange={setSim} onRan={() => { setRefreshKey(k => k + 1); loadAccounts() }} setMessage={setMessage} refreshKey={refreshKey} />
        </>
      )}
      {tab === 'recaptcha' && <MobileRecaptcha base={base} onLog={onLog} setMessage={setMessage} />}
      <Log entries={log} clear={() => setLog([])} />
    </div>
  )
}
