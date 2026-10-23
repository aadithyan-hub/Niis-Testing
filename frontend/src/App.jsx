// Throwaway tester for NIIS APIs: social media publishing (sheet row 57) and
// the media library (gap #26, in MediaLibrary.jsx).
// Not production code: plain Tailwind, no routing.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { makeApi } from './api.js'
import MediaLibrary from './MediaLibrary.jsx'

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

// ── Connected Pages (admin) ─────────────────────────────────────────────────
function Accounts({ api, accounts, reload, setMessage }) {
  const [pageId, setPageId] = useState('')
  const [token, setToken] = useState('')
  const [busy, run] = useAction(setMessage)

  const connect = () => run(async () => {
    await api('POST', '/api/v1/admin/social/accounts/', { platform: 'facebook', page_id: pageId.trim(), access_token: token.trim() })
    setToken('')
    await reload()
  }, 'Page connected')

  const act = (fn, text) => run(async () => { await fn(); await reload() }, text)

  return (
    <Section title="1. Connected Facebook Pages (admin)" right={<Btn onClick={reload}>Reload</Btn>}>
      {accounts === null && <p className="text-sm text-gray-600">Log in as <b>testadmin</b> to manage Pages (editors get 403 here).</p>}
      {accounts && accounts.length === 0 && <p className="text-sm text-gray-600">No Page connected yet.</p>}
      {accounts && accounts.length > 0 && (
        <table className="w-full text-sm mb-4">
          <thead><tr className="text-left border-b"><th>Page</th><th>Token</th><th>Expires</th><th>Active</th><th>Last error</th><th></th></tr></thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className="border-b align-top">
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
                    const t = window.prompt('New access token (Page token or user token)')
                    if (t) act(() => api('PATCH', `/api/v1/admin/social/accounts/${a.id}/`, { access_token: t.trim() }), 'Token replaced')
                  }}>Replace token</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {accounts !== null && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end text-sm">
          <label>Page ID<input className={input} value={pageId} onChange={e => setPageId(e.target.value)} placeholder="1340308269168285" /></label>
          <label>Access token (Page or user token)<input className={input} type="password" value={token} onChange={e => setToken(e.target.value)} /></label>
          <Btn disabled={busy || !pageId || !token} onClick={connect}>Connect Page</Btn>
        </div>
      )}
    </Section>
  )
}

// ── Content + "Post to Facebook" ────────────────────────────────────────────
function PostForm({ api, content, accounts, onDone, setMessage }) {
  const [accountId, setAccountId] = useState('')
  const [message, setMsg] = useState('')
  const [when, setWhen] = useState('')
  const [includeImage, setIncludeImage] = useState(true)
  const [imageUrl, setImageUrl] = useState('')
  const [busy, run] = useAction(setMessage)

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
      <div className="font-medium">Post "{content.title}" to Facebook</div>
      <label className="block">Page
        <select className={input} value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">(auto: the only active Page)</option>
          {(accounts || []).filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.page_name || a.page_id}</option>)}
        </select>
      </label>
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
      <Btn disabled={busy} onClick={submit} className="bg-blue-600! text-white! border-blue-700!">Post to Facebook</Btn>
    </div>
  )
}

function Contents({ api, accounts, onPosted, setMessage }) {
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
        <thead><tr className="text-left border-b"><th>Title</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {items.map(c => (
            <tr key={c.id} className={`border-b ${selected?.id === c.id ? 'bg-blue-50' : ''}`}>
              <td className="py-1">{c.title}<div className="text-xs text-gray-500">{c.slug}</div></td>
              <td><Badge value={c.status} /></td>
              <td className="space-x-1 whitespace-nowrap text-right">
                <Btn onClick={() => setSelected(selected?.id === c.id ? null : c)}>{selected?.id === c.id ? 'Close' : 'Post to Facebook...'}</Btn>
                {c.status === 'pending_review' && <Btn disabled={busy} onClick={() => approve(c)}>Approve (editor)</Btn>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && <PostForm api={api} content={selected} accounts={accounts} onDone={onPosted} setMessage={setMessage} />}
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
          <thead><tr className="text-left border-b"><th>Content</th><th>Status</th><th>When</th><th>Facebook</th><th>Reactions / comments / shares</th><th></th></tr></thead>
          <tbody>
            {posts.map(p => (
              <tr key={p.id} className="border-b align-top">
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
                  <div className="text-gray-500">{p.external_id}</div>
                </td>
                <td className="text-xs">
                  {p.metrics_updated_at
                    ? `${p.reactions_count ?? 'n/a'} / ${p.comments_count ?? 'n/a'} / ${p.shares_count}`
                    : 'not fetched yet'}
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
          {[['media', 'Media library (#26)'], ['social', 'Social posting (row 57)']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setMessage(null) }}
              className={`px-3 py-1 rounded-t border text-sm ${tab === key ? 'bg-white border-gray-400 border-b-white font-medium' : 'bg-gray-100 border-gray-300'}`}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">API base
          <input className="border border-gray-400 rounded px-2 py-1 w-72" value={base} onChange={e => setBase(e.target.value)} />
        </label>
        <Login api={api} user={user} onLogin={onLogin} onLogout={onLogout} setMessage={setMessage} tab={tab} />
        {message && (
          <div className={`text-sm p-2 rounded ${message.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
            {message.text} <button className="ml-2 underline" onClick={() => setMessage(null)}>dismiss</button>
          </div>
        )}
      </header>

      {token && tab === 'media' && <MediaLibrary key={token} api={api} base={base} token={token} user={user} setMessage={setMessage} />}
      {token && tab === 'social' && (
        <>
          <Accounts api={api} accounts={accounts} reload={loadAccounts} setMessage={setMessage} />
          <Contents api={api} accounts={accounts} onPosted={() => setRefreshKey(k => k + 1)} setMessage={setMessage} />
          <Posts api={api} refreshKey={refreshKey} setMessage={setMessage} />
        </>
      )}
      <Log entries={log} clear={() => setLog([])} />
    </div>
  )
}
