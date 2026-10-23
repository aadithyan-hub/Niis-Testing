// Throwaway tester for the NIIS media library API (gap #26, sheet row 50).
// Not production code. It shows every call in the API log at the bottom.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { errorText } from './api.js'

const LIB = '/api/v1/admin/media'

function Section({ title, children, right }) {
  return (
    <section className="border border-gray-300 rounded p-4 bg-white">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
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
      className={`px-3 py-1 rounded border border-gray-400 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-sm ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

const input = 'border border-gray-400 rounded px-2 py-1 text-sm w-full'
const primary = 'bg-blue-600! text-white! border-blue-700! hover:bg-blue-700!'
const danger = 'bg-red-50! text-red-800! border-red-300!'

function Chip({ on, children }) {
  return <span className={`px-1.5 py-0.5 rounded text-xs ${on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-400 line-through'}`}>{children}</span>
}

function Tag({ children, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700', blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800', purple: 'bg-purple-100 text-purple-800',
    red: 'bg-red-100 text-red-800', green: 'bg-green-100 text-green-800',
  }
  return <span className={`px-1.5 py-0.5 rounded text-xs ${tones[tone]}`}>{children}</span>
}

function useAction(setMessage) {
  const [busy, setBusy] = useState(false)
  const run = async (fn, okText) => {
    setBusy(true)
    try {
      const result = await fn()
      if (okText) setMessage({ ok: true, text: typeof okText === 'function' ? okText(result) : okText })
      return result
    } catch (e) {
      setMessage({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }
  return [busy, run]
}

const fmtSize = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

// What the backend promises for each role (DIPR's decision, sheet row 50).
const RULES = {
  super_admin: 'Sees every asset in every district, and the bin. Can do everything.',
  admin: 'Sees every asset in every district, and the bin. Can do everything.',
  editor: 'Sees every asset in every district, and the bin. Can do everything.',
  dpro: 'Sees every asset of their own districts, private ones too. Edits only their own uploads and assets shared with them for editing.',
  apro: 'Sees every asset of their own districts, private ones too. Edits only their own uploads and assets shared with them for editing.',
  ia: 'Sees their own uploads and "district" assets of their districts - never another person\'s private file - plus anything shared with them.',
  field_officer: 'Sees their own uploads and "district" assets of their districts - never another person\'s private file - plus anything shared with them.',
}

// ── File helpers: stream mode needs the Authorization header ────────────────
async function authBlob(base, token, path) {
  const res = await fetch(base.replace(/\/$/, '') + path, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    let data = null
    try { data = await res.json() } catch { /* binary or empty */ }
    throw new Error(errorText(data) || `HTTP ${res.status}`)
  }
  return res.blob()
}

function Thumb({ asset, base, token, delivery }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let url = ''
    let cancelled = false
    if (!asset.thumbnail_url) { setSrc(''); return undefined }
    if (delivery !== 'stream') { setSrc(asset.thumbnail_url); return undefined }
    authBlob(base, token, asset.thumbnail_url).then(blob => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setSrc(url)
    }).catch(() => setSrc(''))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [asset.thumbnail_url, base, token, delivery])
  if (!src) {
    const icon = { video: '🎬', document: '📄', publication: '📘' }[asset.media_type] || '🖼️'
    return <div className="w-full h-28 flex items-center justify-center bg-gray-100 text-3xl">{icon}</div>
  }
  return <img src={src} alt={asset.alt_text || asset.title} className="w-full h-28 object-cover bg-gray-100" />
}

// Upload with a progress bar: fetch() cannot report upload progress.
function xhrSend(method, url, token, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    if (!(body instanceof FormData)) xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.onload = () => {
      let data = null
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null } catch { data = xhr.responseText }
      resolve({ status: xhr.status, data, retryAfter: xhr.getResponseHeader('Retry-After') })
    }
    xhr.onerror = () => reject(new Error(`Cannot reach ${url}`))
    xhr.send(body instanceof FormData ? body : JSON.stringify(body))
  })
}

// ── 1. Who am I ─────────────────────────────────────────────────────────────
function WhoAmI({ user, options }) {
  if (!options) return null
  return (
    <Section title="1. Who am I (GET options/)">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div><div className="text-gray-500 text-xs">Role</div>{user?.role}</div>
        <div><div className="text-gray-500 text-xs">My districts</div>{options.your_districts.join(', ') || '(none)'}</div>
        <div><div className="text-gray-500 text-xs">My department</div>{options.your_department || '(none)'}</div>
        <div><div className="text-gray-500 text-xs">Library manager</div>{options.is_manager ? 'yes' : 'no'}</div>
        <div><div className="text-gray-500 text-xs">Delivery</div>{options.delivery} {options.delivery === 'redirect' ? `(links expire in ${options.link_seconds}s)` : '(bytes through the API)'}</div>
        <div className="md:col-span-3"><div className="text-gray-500 text-xs">What this role should see</div>{RULES[user?.role] || '-'}</div>
      </div>
    </Section>
  )
}

// ── 2. Upload ───────────────────────────────────────────────────────────────
function Upload({ api, base, token, options, onUploaded, setMessage }) {
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [altText, setAltText] = useState('')
  const [tags, setTags] = useState('')
  const [district, setDistrict] = useState('')
  const [visibility, setVisibility] = useState('district')
  const [category, setCategory] = useState('')
  const [department, setDepartment] = useState('')
  const [isPublication, setIsPublication] = useState(false)
  const [chunked, setChunked] = useState(false)
  const [progress, setProgress] = useState(null)
  const [last, setLast] = useState(null)
  const [busy, run] = useAction(setMessage)
  const fileRef = useRef(null)

  const districts = options.is_manager ? options.districts : options.your_districts
  useEffect(() => { setDistrict(options.is_manager ? '' : (options.your_districts[0] || '')) }, [options])

  const meta = () => {
    const m = {}
    if (title.trim()) m.title = title.trim()
    if (description.trim()) m.description = description.trim()
    if (altText.trim()) m.alt_text = altText.trim()
    m.district = district
    m.visibility = visibility
    if (category) m.category = Number(category)
    if (department) m.department = department
    if (isPublication) m.is_publication = true
    return m
  }
  const tagList = () => tags.split(',').map(t => t.trim()).filter(Boolean)

  const uploadDirect = async () => {
    const form = new FormData()
    form.append('file', file)
    Object.entries(meta()).forEach(([k, v]) => form.append(k, String(v)))
    tagList().forEach(t => form.append('tags', t))
    const res = await xhrSend('POST', `${base.replace(/\/$/, '')}${LIB}/assets/`, token, form, setProgress)
    if (res.status === 503 && res.retryAfter) throw new Error(`Server busy (503). Retry after ${res.retryAfter}s - nothing was saved.`)
    if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${errorText(res.data)}`)
    return res.data
  }

  const uploadChunked = async () => {
    const init = await api('POST', '/api/v1/media/chunked/', { file_name: file.name, total_size: file.size, library: true })
    const { upload_id: id, chunk_size: size, total_chunks: total } = init
    for (let n = 1; n <= total; n += 1) {
      const form = new FormData()
      form.append('chunk', file.slice((n - 1) * size, n * size), 'chunk')
      const res = await xhrSend('PUT', `${base.replace(/\/$/, '')}/api/v1/media/chunked/${id}/${n}/`, token, form,
        p => setProgress(((n - 1) + p) / total))
      if (res.status >= 400) throw new Error(`Chunk ${n}: HTTP ${res.status} ${errorText(res.data)}`)
    }
    await api('POST', `/api/v1/media/chunked/${id}/complete/`)
    return api('POST', `${LIB}/assets/`, { chunked_upload_id: id, ...meta(), tags: tagList() })
  }

  const submit = () => run(async () => {
    setProgress(0)
    try {
      const asset = chunked ? await uploadChunked() : await uploadDirect()
      setLast(asset)
      setFile(null); setTitle(''); setDescription(''); setAltText(''); setTags('')
      if (fileRef.current) fileRef.current.value = ''
      onUploaded(asset)
      return asset
    } finally {
      setProgress(null)
    }
  }, a => `Uploaded "${a.title}" (${a.media_type}, ${a.district || 'no district'}, ${a.visibility})`)

  return (
    <Section title="2. Upload a file">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
        <label className="md:col-span-3">File (images ≤ {options.max_upload_mb.image} MB, documents ≤ {options.max_upload_mb.document} MB, videos ≤ {options.max_upload_mb.video} MB; chunked up to {options.max_upload_mb.chunked} MB)
          <input ref={fileRef} className={input} type="file" onChange={e => setFile(e.target.files[0] || null)} />
        </label>
        <label>Title (empty = from file name)<input className={input} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>Tags (comma separated)<input className={input} value={tags} onChange={e => setTags(e.target.value)} placeholder="harvest, kohima" /></label>
        <label>Alt text (images)<input className={input} value={altText} onChange={e => setAltText(e.target.value)} /></label>
        <label className="md:col-span-3">Description<input className={input} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label>District
          <select className={input} value={district} onChange={e => setDistrict(e.target.value)}>
            {options.is_manager && <option value="">(none - managers only)</option>}
            {districts.map(d => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>Visibility
          <select className={input} value={visibility} onChange={e => setVisibility(e.target.value)}>
            {options.visibility.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
        <label>Category
          <select className={input} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">(none)</option>
            {options.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        {options.is_manager && (
          <label>Department (managers)
            <select className={input} value={department} onChange={e => setDepartment(e.target.value)}>
              <option value="">(uploader's own)</option>
              {options.departments.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2"><input type="checkbox" checked={isPublication} onChange={e => setIsPublication(e.target.checked)} /> Publication (documents only)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={chunked} onChange={e => setChunked(e.target.checked)} /> Chunked upload with progress (big videos / documents)</label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Btn disabled={busy || !file} onClick={submit} className={primary}>Upload</Btn>
        {progress !== null && (
          <div className="flex-1 h-3 bg-gray-200 rounded overflow-hidden"><div className="h-3 bg-blue-600" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        )}
        {progress !== null && <span className="text-xs">{Math.round(progress * 100)}%</span>}
      </div>
      {last?.possible_duplicates?.length > 0 && (
        <p className="mt-2 text-sm text-amber-800 bg-amber-50 p-2 rounded">
          This looks like a file already in the library: {last.possible_duplicates.map(d => d.title).join(', ')}. (It was uploaded anyway.)
        </p>
      )}
    </Section>
  )
}

// ── 3. Library list ─────────────────────────────────────────────────────────
const EMPTY_FILTERS = { q: '', media_type: '', district: '', category: '', source: '', visibility: '', tag: '', owner: '', shared_with_me: '', deleted: '', ordering: '-created_at' }

function Library({ api, base, token, options, refreshKey, selectedId, onSelect, setMessage }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [busy, run] = useAction(setMessage)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v) })
    p.set('page', String(page))
    return p.toString()
  }, [filters, page])

  const load = useCallback(() => run(async () => setData(await api('GET', `${LIB}/assets/?${query}`))), [api, query]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, refreshKey])

  const set = (k, v) => { setPage(1); setFilters(f => ({ ...f, [k]: v })) }

  return (
    <Section title={`3. Library ${data ? `(${data.count})` : ''}`} right={<div className="flex gap-1"><Btn onClick={() => { setPage(1); setFilters(EMPTY_FILTERS) }}>Clear filters</Btn><Btn disabled={busy} onClick={load}>Reload</Btn></div>}>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm mb-3">
        <input className={`${input} md:col-span-2`} placeholder="Search title, tags, file name..." value={filters.q} onChange={e => set('q', e.target.value)} />
        <select className={input} value={filters.media_type} onChange={e => set('media_type', e.target.value)}>
          <option value="">any type</option>{options.media_types.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select className={input} value={filters.district} onChange={e => set('district', e.target.value)}>
          <option value="">any district</option>{options.districts.map(d => <option key={d}>{d}</option>)}
        </select>
        <select className={input} value={filters.category} onChange={e => set('category', e.target.value)}>
          <option value="">any category</option>{options.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select className={input} value={filters.source} onChange={e => set('source', e.target.value)}>
          <option value="">any source</option>{options.sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={input} value={filters.visibility} onChange={e => set('visibility', e.target.value)}>
          <option value="">any visibility</option>{options.visibility.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
        <input className={input} placeholder="exact tag" value={filters.tag} onChange={e => set('tag', e.target.value)} />
        <select className={input} value={filters.ordering} onChange={e => set('ordering', e.target.value)}>
          {options.ordering.map(o => <option key={o}>{o}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={filters.owner === 'me'} onChange={e => set('owner', e.target.checked ? 'me' : '')} /> my uploads</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!filters.shared_with_me} onChange={e => set('shared_with_me', e.target.checked ? 'true' : '')} /> shared with me</label>
        {options.is_manager && <label className="flex items-center gap-1"><input type="checkbox" checked={!!filters.deleted} onChange={e => set('deleted', e.target.checked ? 'true' : '')} /> the bin</label>}
      </div>
      {data && data.results.length === 0 && <p className="text-sm text-gray-600">Nothing here.</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {(data?.results || []).map(a => (
          <button key={a.id} onClick={() => onSelect(a.id)}
            className={`text-left border rounded overflow-hidden bg-white hover:shadow ${selectedId === a.id ? 'ring-2 ring-blue-500' : ''}`}>
            <Thumb asset={a} base={base} token={token} delivery={options.delivery} />
            <div className="p-2 space-y-1">
              <div className="text-sm font-medium truncate" title={a.title}>{a.title}</div>
              <div className="flex flex-wrap gap-1">
                <Tag tone="blue">{a.media_type}</Tag>
                <Tag tone={a.visibility === 'private' ? 'amber' : 'gray'}>{a.visibility}</Tag>
                {a.source.type === 'field_report' && <Tag tone="purple">field report</Tag>}
                {a.public_url && <Tag tone="green">published</Tag>}
                {a.is_deleted && <Tag tone="red">in bin</Tag>}
              </div>
              <div className="text-xs text-gray-500 truncate">{a.district || 'no district'} · {a.owner?.name}</div>
            </div>
          </button>
        ))}
      </div>
      {data && (data.next || data.previous) && (
        <div className="mt-3 flex gap-2 items-center text-sm">
          <Btn disabled={!data.previous} onClick={() => setPage(p => p - 1)}>Previous</Btn>
          <span>page {page}</span>
          <Btn disabled={!data.next} onClick={() => setPage(p => p + 1)}>Next</Btn>
        </div>
      )}
    </Section>
  )
}

// ── 4. One asset ────────────────────────────────────────────────────────────
function Detail({ api, base, token, options, assetId, onChanged, onSelect, setMessage }) {
  const [asset, setAsset] = useState(null)
  const [versions, setVersions] = useState([])
  const [form, setForm] = useState({})
  const [busy, run] = useAction(setMessage)

  const load = useCallback(async () => {
    try {
      const a = await api('GET', `${LIB}/assets/${assetId}/`)
      setAsset(a)
      setForm({ title: a.title, description: a.description, alt_text: a.alt_text, tags: a.tags.join(', '),
        district: a.district, visibility: a.visibility, department: a.department, category: a.category?.id || '' })
      setVersions(await api('GET', `${LIB}/assets/${assetId}/versions/`))
    } catch (e) {
      setAsset(null)
      setMessage({ ok: false, text: `${e.message} (an asset you may not see answers 404)` })
    }
  }, [api, assetId, setMessage])
  useEffect(() => { load() }, [load])

  if (!asset) return null
  const p = asset.permissions
  const changed = () => { load(); onChanged() }

  const open = (disposition, version) => run(async () => {
    const v = version ? `&version=${version}` : ''
    if (options.delivery === 'stream') {
      const blob = await authBlob(base, token, `${LIB}/assets/${asset.id}/download/?disposition=${disposition}${v}`)
      const url = URL.createObjectURL(blob)
      if (disposition === 'inline') window.open(url, '_blank')
      else Object.assign(document.createElement('a'), { href: url, download: asset.file_name }).click()
      return
    }
    const win = disposition === 'inline' ? window.open('', '_blank') : null
    const link = await api('GET', `${LIB}/assets/${asset.id}/download/?as=json&disposition=${disposition}${v}`)
    if (win) win.location = link.url
    else window.location.href = link.url
  }, disposition === 'inline' ? 'Opened through a short-lived link (logged as MEDIA_ASSET_VIEWED)' : 'Downloading (logged as MEDIA_ASSET_DOWNLOADED)')

  const save = () => run(async () => {
    const body = { title: form.title, description: form.description, alt_text: form.alt_text,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean), category: form.category ? Number(form.category) : null }
    if (p.can_share) { body.visibility = form.visibility; body.district = form.district }
    if (options.is_manager) body.department = form.department
    await api('PATCH', `${LIB}/assets/${asset.id}/`, body)
    changed()
  }, 'Saved')

  const publish = version => run(async () => {
    const r = await api('POST', `${LIB}/assets/${asset.id}/publish/`, version ? { version } : {})
    changed()
    return r
  }, r => `Public URL ${r.created ? 'created' : '(already existed)'}: ${r.public_url}`)

  const remove = () => run(async () => { await api('DELETE', `${LIB}/assets/${asset.id}/`); onSelect(null); onChanged() }, 'Moved to the bin')
  const restore = () => run(async () => { await api('POST', `${LIB}/assets/${asset.id}/restore/`); changed() }, 'Restored from the bin')
  const togglePublication = () => run(async () => {
    await api('PATCH', `${LIB}/assets/${asset.id}/`, { is_publication: asset.media_type !== 'publication' }); changed()
  }, 'Changed')

  return (
    <Section title={`4. ${asset.title}`} right={<div className="flex gap-1"><Btn onClick={load}>Reload</Btn><Btn onClick={() => onSelect(null)}>Close</Btn></div>}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
        <div className="space-y-2">
          <Thumb asset={asset} base={base} token={token} delivery={options.delivery} />
          <div className="flex flex-wrap gap-1">
            <Chip on={p.can_edit}>can_edit</Chip><Chip on={p.can_publish}>can_publish</Chip>
            <Chip on={p.can_share}>can_share</Chip><Chip on={p.can_delete}>can_delete</Chip>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {[['type', asset.media_type], ['file', `${asset.file_name} (${asset.content_type}, ${fmtSize(asset.size_bytes)})`],
                ['size', asset.width ? `${asset.width} × ${asset.height}` : '-'], ['version', asset.current_version],
                ['district', asset.district || '-'], ['department', asset.department || '-'], ['visibility', asset.visibility],
                ['owner', asset.owner?.name], ['source', asset.source.type + (asset.source.id ? ` (${asset.source.id.slice(0, 8)}…)` : '')],
                ['public_url', asset.public_url || '(not published)']].map(([k, v]) => (
                <tr key={k} className="border-b align-top"><td className="pr-2 text-gray-500">{k}</td><td className="break-all">{String(v)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-1">
            <Btn onClick={() => open('inline')}>Open</Btn>
            <Btn onClick={() => open('attachment')}>Download</Btn>
            <Btn disabled={!p.can_publish || busy} onClick={() => publish()}>Use in article (publish)</Btn>
            {(asset.media_type === 'document' || asset.media_type === 'publication') &&
              <Btn disabled={!p.can_edit || busy} onClick={togglePublication}>{asset.media_type === 'publication' ? 'Unmark publication' : 'Mark as publication'}</Btn>}
            {!asset.is_deleted && <Btn disabled={!p.can_delete || busy} onClick={remove} className={danger}>Delete</Btn>}
            {asset.is_deleted && <Btn disabled={busy} onClick={restore}>Restore from bin</Btn>}
          </div>
          {asset.public_url && <a className="text-blue-700 underline text-xs break-all" href={asset.public_url} target="_blank" rel="noreferrer">open public copy (works logged out)</a>}
        </div>

        <div className="space-y-2">
          <div className="font-medium">Details {!p.can_edit && <span className="text-xs text-gray-500">(view only - saving should give 403)</span>}</div>
          {['title', 'description', 'alt_text', 'tags'].map(k => (
            <label key={k} className="block">{k}<input className={input} value={form[k] ?? ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></label>
          ))}
          <label className="block">category
            <select className={input} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="">(none)</option>{options.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>visibility {!p.can_share && <span className="text-xs text-gray-400">(owner/manager)</span>}
              <select className={input} disabled={!p.can_share} value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}>
                {options.visibility.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </label>
            <label>district {!p.can_share && <span className="text-xs text-gray-400">(owner/manager)</span>}
              <select className={input} disabled={!p.can_share} value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}>
                <option value="">(none)</option>{options.districts.map(d => <option key={d}>{d}</option>)}
              </select>
            </label>
          </div>
          {options.is_manager && (
            <label className="block">department (managers)
              <select className={input} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                <option value="">(none)</option>{[...new Set([form.department, ...options.departments])].filter(Boolean).map(d => <option key={d}>{d}</option>)}
              </select>
            </label>
          )}
          <Btn disabled={busy} onClick={save} className={primary}>Save details</Btn>
        </div>

        <div className="space-y-3">
          <Versions api={api} asset={asset} versions={versions} open={open} publish={publish} changed={changed} setMessage={setMessage} />
        </div>
      </div>
      {asset.media_type === 'image' && <Transform api={api} asset={asset} options={options} changed={changed} onSelect={onSelect} setMessage={setMessage} />}
      {p.can_share && <Shares api={api} asset={asset} options={options} changed={changed} setMessage={setMessage} />}
      <details className="mt-3 text-xs"><summary className="cursor-pointer text-gray-600">Raw JSON</summary><pre className="bg-gray-50 p-2 overflow-auto max-h-80">{JSON.stringify(asset, null, 2)}</pre></details>
    </Section>
  )
}

function Versions({ api, asset, versions, open, publish, changed, setMessage }) {
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [busy, run] = useAction(setMessage)
  const fileRef = useRef(null)

  const upload = () => run(async () => {
    const form = new FormData()
    form.append('file', file)
    if (note.trim()) form.append('change_note', note.trim())
    await api('POST', `${LIB}/assets/${asset.id}/versions/`, form)
    setFile(null); setNote(''); if (fileRef.current) fileRef.current.value = ''
    changed()
  }, 'New version uploaded')

  const restore = n => run(async () => {
    await api('POST', `${LIB}/assets/${asset.id}/versions/${n}/restore/`, { change_note: `Restored v${n} from the tester` })
    changed()
  }, `Version ${n} restored as a new version`)

  return (
    <>
      <div className="font-medium">Versions</div>
      <table className="w-full text-xs">
        <thead><tr className="text-left border-b"><th>v</th><th>change</th><th>size</th><th></th></tr></thead>
        <tbody>
          {versions.map(v => (
            <tr key={v.id} className={`border-b align-top ${v.is_current ? 'bg-blue-50' : ''}`}>
              <td>{v.version_number}{v.is_current && ' ●'}</td>
              <td>{v.change_type}{v.change_note && <div className="text-gray-500">{v.change_note}</div>}<div className="text-gray-400">{v.created_by?.name}</div></td>
              <td>{v.width ? `${v.width}×${v.height}` : ''}<div>{v.content_type}</div></td>
              <td className="whitespace-nowrap space-x-1">
                <button className="underline" onClick={() => open('inline', v.version_number)}>open</button>
                {!v.is_current && asset.permissions.can_edit && <button className="underline" disabled={busy} onClick={() => restore(v.version_number)}>restore</button>}
                {asset.permissions.can_publish && !v.public_url && <button className="underline" onClick={() => publish(v.version_number)}>publish</button>}
                {v.public_url && <a className="underline text-green-700" href={v.public_url} target="_blank" rel="noreferrer">public</a>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {asset.permissions.can_edit && (
        <div className="space-y-1 border-t pt-2">
          <div className="text-xs text-gray-600">Replace the file (must be the same kind: {asset.media_type === 'publication' ? 'document' : asset.media_type})</div>
          <input ref={fileRef} className={input} type="file" onChange={e => setFile(e.target.files[0] || null)} />
          <input className={input} placeholder="change note" value={note} onChange={e => setNote(e.target.value)} />
          <Btn disabled={busy || !file} onClick={upload}>Upload new version</Btn>
        </div>
      )}
    </>
  )
}

function Transform({ api, asset, options, changed, onSelect, setMessage }) {
  const [rotate, setRotate] = useState(0)
  const [crop, setCrop] = useState({ x: '', y: '', width: '', height: '' })
  const [resize, setResize] = useState({ width: '', height: '' })
  const [format, setFormat] = useState('')
  const [quality, setQuality] = useState(85)
  const [saveAs, setSaveAs] = useState('new_version')
  const [title, setTitle] = useState('')
  const [busy, run] = useAction(setMessage)

  const submit = () => run(async () => {
    const body = { save_as: saveAs, change_note: 'Edited in the tester' }
    if (rotate) body.rotate = Number(rotate)
    if (crop.width && crop.height) body.crop = { x: Number(crop.x || 0), y: Number(crop.y || 0), width: Number(crop.width), height: Number(crop.height) }
    if (resize.width || resize.height) body.resize = Object.fromEntries(Object.entries(resize).filter(([, v]) => v).map(([k, v]) => [k, Number(v)]))
    if (format) { body.format = format; if (format !== 'png') body.quality = Number(quality) }
    if (saveAs === 'new_asset' && title.trim()) body.title = title.trim()
    const result = await api('POST', `${LIB}/assets/${asset.id}/transform/`, body)
    if (saveAs === 'new_asset') { onSelect(result.id) } else changed()
    return result
  }, r => `Done: ${r.width} × ${r.height} ${r.content_type}${saveAs === 'new_asset' ? ' (new asset opened)' : ` (now v${r.current_version})`}`)

  const box = (state, setter, keys) => keys.map(k => (
    <input key={k} className={input} placeholder={k} value={state[k]} onChange={e => setter(s => ({ ...s, [k]: e.target.value }))} />
  ))

  return (
    <div className="mt-4 border-t pt-3 text-sm">
      <div className="font-medium mb-2">Crop / resize / rotate / convert {!asset.permissions.can_edit && <span className="text-xs text-gray-500">(needs can_edit - expect 403)</span>}</div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <label>rotate (clockwise)
          <select className={input} value={rotate} onChange={e => setRotate(e.target.value)}>{options.image_editing.rotate.map(r => <option key={r} value={r}>{r}°</option>)}</select>
        </label>
        <div className="md:col-span-2"><div className="text-xs">crop box on the rotated image (current {asset.width}×{asset.height})</div><div className="grid grid-cols-4 gap-1">{box(crop, setCrop, ['x', 'y', 'width', 'height'])}</div></div>
        <div><div className="text-xs">resize (one side keeps ratio)</div><div className="grid grid-cols-2 gap-1">{box(resize, setResize, ['width', 'height'])}</div></div>
        <label>format
          <select className={input} value={format} onChange={e => setFormat(e.target.value)}><option value="">(keep)</option>{options.image_editing.formats.map(f => <option key={f}>{f}</option>)}</select>
        </label>
        <label>quality<input className={input} type="number" min="1" max="100" value={quality} onChange={e => setQuality(e.target.value)} /></label>
        <label>save as
          <select className={input} value={saveAs} onChange={e => setSaveAs(e.target.value)}>
            <option value="new_version">new version</option>
            <option value="new_asset">new asset (owner / manager)</option>
          </select>
        </label>
        {saveAs === 'new_asset' && <label className="md:col-span-2">new title<input className={input} value={title} onChange={e => setTitle(e.target.value)} /></label>}
        <Btn disabled={busy} onClick={submit} className={primary}>Apply</Btn>
      </div>
    </div>
  )
}

function Shares({ api, asset, options, changed, setMessage }) {
  const [department, setDepartment] = useState('')
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [canEdit, setCanEdit] = useState(false)
  const [busy, run] = useAction(setMessage)

  const search = () => run(async () => setPeople(await api('GET', `${LIB}/share-targets/?q=${encodeURIComponent(q)}`)))
  const share = body => run(async () => { await api('POST', `${LIB}/assets/${asset.id}/shares/`, { ...body, can_edit: canEdit }); changed() }, 'Shared')
  const toggle = s => run(async () => { await api('PATCH', `${LIB}/assets/${asset.id}/shares/${s.id}/`, { can_edit: !s.can_edit }); changed() }, 'Share level changed')
  const remove = s => run(async () => { await api('DELETE', `${LIB}/assets/${asset.id}/shares/${s.id}/`); changed() }, 'Share removed')

  return (
    <div className="mt-4 border-t pt-3 text-sm">
      <div className="font-medium mb-2">Sharing (owner and managers)</div>
      {(asset.shares || []).length === 0 && <p className="text-gray-600 text-xs mb-2">Not shared with anyone.</p>}
      {(asset.shares || []).length > 0 && (
        <table className="w-full text-xs mb-3">
          <tbody>
            {asset.shares.map(s => (
              <tr key={s.id} className="border-b">
                <td className="py-1">{s.department ? `Department: ${s.department}` : `Person: ${s.user?.name}`}</td>
                <td>{s.can_edit ? 'view + edit' : 'view'}</td>
                <td className="text-right space-x-1"><Btn disabled={busy} onClick={() => toggle(s)}>{s.can_edit ? 'make view-only' : 'allow edit'}</Btn><Btn disabled={busy} onClick={() => remove(s)} className={danger}>remove</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <div className="text-xs">With a whole department (any district)</div>
          <select className={input} value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="">choose...</option>{options.departments.map(d => <option key={d}>{d}</option>)}
          </select>
          <Btn disabled={busy || !department} onClick={() => share({ department })}>Share with department</Btn>
        </div>
        <div className="space-y-1 md:col-span-2">
          <div className="text-xs">With one person (GET share-targets/?q=name)</div>
          <div className="flex gap-1"><input className={input} placeholder="name, 2+ letters" value={q} onChange={e => setQ(e.target.value)} /><Btn disabled={busy || q.trim().length < 2} onClick={search}>Find</Btn></div>
          {people.map(person => (
            <div key={person.id} className="flex items-center justify-between border-b py-1 text-xs">
              <span>{person.name} · {person.role_label} · {person.districts.join(', ') || '-'} · {person.department || '-'}</span>
              <Btn disabled={busy} onClick={() => share({ user_id: person.id })}>Share</Btn>
            </div>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={canEdit} onChange={e => setCanEdit(e.target.checked)} /> new shares allow editing (details, new versions, crop, publish)</label>
    </div>
  )
}

// ── 5. FR-012: approved field report → library ──────────────────────────────
function FieldReports({ api, base, token, user, options, onImported, setMessage }) {
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('Flood damage near the bridge')
  const [instances, setInstances] = useState([])
  const [busy, run] = useAction(setMessage)
  const isReporter = ['field_officer', 'ia', 'apro'].includes(user?.role)
  const isReviewer = ['dpro', 'editor', 'admin', 'super_admin'].includes(user?.role)

  const create = () => run(async () => {
    const form = new FormData()
    form.append('file', file)
    const up = await xhrSend('POST', `${base.replace(/\/$/, '')}/api/v1/media/upload/`, token, form)
    if (up.status >= 400) throw new Error(`upload: HTTP ${up.status} ${errorText(up.data)}`)
    const url = up.data.url || up.data.file_url
    const report = await api('POST', '/api/v1/field-reports/sync/', {
      title, description: 'Created from the media library tester.', category: 'general',
      district: options.your_districts[0] || '', latitude: 25.67, longitude: 94.11,
      sync_id: crypto.randomUUID(), media_urls: [url],
    })
    await api('POST', `/api/v1/field-reports/${report.id}/submit/`)
    return report
  }, 'Report created and submitted. Log in as dpro_kohima to approve stage 1, then editor1 for stage 2.')

  const loadInstances = useCallback(async () => {
    try {
      const data = await api('GET', '/api/v1/workflow/instances/')
      setInstances((data.results || data).filter(w => w.object_type === 'field_report'))
    } catch { setInstances([]) }
  }, [api])
  useEffect(() => { if (isReviewer) loadInstances() }, [isReviewer, loadInstances])

  const act = (w, action) => run(async () => {
    const r = await api('POST', `/api/v1/workflow/instances/${w.id}/action/`, {
      action, comments: action === 'reject' ? 'Rejected from the tester: photos are not clear enough.' : 'Approved from the tester',
    })
    await loadInstances()
    if (r.status === 'completed') onImported()
    return r
  }, r => (r.status === 'completed' ? 'Workflow completed: the report is approved and its photo is now in the library (filter source = Approved field report).' : `Workflow now: ${r.status}`))

  return (
    <Section title="5. Field report → library (SRS FR-012)" right={isReviewer && <Btn onClick={loadInstances}>Reload</Btn>}>
      <p className="text-xs text-gray-600 mb-2">An approved field report's photos and videos are added to the library automatically, owned by the reporter, in the report's district. Rejected reports are not.</p>
      {isReporter && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end text-sm mb-3">
          <label>Photo for the report<input className={input} type="file" accept="image/*" onChange={e => setFile(e.target.files[0] || null)} /></label>
          <label>Report title<input className={input} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <Btn disabled={busy || !file || title.trim().length < 5} onClick={create} className={primary}>Create and submit report</Btn>
        </div>
      )}
      {isReviewer && (
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th>Report</th><th>Stage</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {instances.length === 0 && <tr><td colSpan={4} className="text-gray-500 py-1">No field report workflows.</td></tr>}
            {instances.map(w => (
              <tr key={w.id} className="border-b">
                <td className="py-1 text-xs">{w.object_title || w.object_id}</td>
                <td className="text-xs">{w.current_stage?.name || w.current_stage_name || '-'} ({w.current_stage?.assigned_role || w.assigned_role || ''})</td>
                <td><Tag tone={w.status === 'completed' ? 'green' : w.status === 'rejected' ? 'red' : 'blue'}>{w.status}</Tag></td>
                <td className="text-right space-x-1 whitespace-nowrap">
                  {w.status === 'active' && <><Btn disabled={busy} onClick={() => act(w, 'approve')}>Approve</Btn><Btn disabled={busy} onClick={() => act(w, 'reject')} className={danger}>Reject</Btn></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!isReporter && !isReviewer && <p className="text-sm text-gray-600">Log in as fo_kohima to create a report, or dpro_kohima / editor1 to approve.</p>}
    </Section>
  )
}

// ── 6. Checklist ────────────────────────────────────────────────────────────
const CHECKS = [
  ['citizen1 / analyst', 'The library answers 403. (citizen1 logs in by OTP, so it is not on the buttons; analyst is.)'],
  ['fo_kohima', 'Upload a phone photo (with GPS). Open it: it carries the DIPR watermark. Download it and check its properties: no GPS / camera details.'],
  ['fo_kohima', 'Upload one "district" photo and one "private" photo.'],
  ['fo_kohima2 (same district)', 'Sees the district photo, NOT the private one. Permissions are all off; Save details gives 403.'],
  ['dpro_kohima / apro_kohima', 'See BOTH Kohima photos (private too), not Dimapur files.'],
  ['ia_dimapur / dpro_dimapur', 'See none of the Kohima files.'],
  ['editor1 / admin', 'See everything; can move department; can open "the bin" and restore.'],
  ['fo_kohima', 'Share the private photo with person "Imna" (view): ia_dimapur now sees it and can download, but not edit. Switch to "allow edit": ia_dimapur can edit and crop, but cannot delete or share.'],
  ['fo_kohima', 'Share with department "Health & Family Welfare": fo_kohima2 and fo_none see it.'],
  ['fo_kohima', 'Crop / rotate / convert to webp → new version. Versions table: restore v1 → a new version, nothing lost.'],
  ['fo_kohima', '"Use in article": a public URL that opens in a private window (logged out). Delete the asset: the public URL still works.'],
  ['any', 'Wait 5 minutes after "Open": the same link no longer works (403). Ask again → new link.'],
  ['fo_kohima', 'Chunked upload of a 40-60 MB video with the progress bar. It plays and seeks.'],
  ['fo_kohima → dpro_kohima → editor1', 'Section 5: create report, approve twice → photo appears with the purple "field report" tag; fo_kohima2 sees it.'],
  ['any', 'Try an .svg, an .exe renamed .jpg, or a PDF with JavaScript: refused with 400.'],
]

function Checklist() {
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem('niis-media-checks') || '{}') } catch { return {} } })
  const toggle = i => setDone(d => { const n = { ...d, [i]: !d[i] }; try { localStorage.setItem('niis-media-checks', JSON.stringify(n)) } catch { /* private mode */ } return n })
  return (
    <Section title="6. What to check" right={<span className="text-xs text-gray-500">{Object.values(done).filter(Boolean).length}/{CHECKS.length}</span>}>
      <ol className="text-sm space-y-1">
        {CHECKS.map(([who, what], i) => (
          <li key={i} className="flex gap-2 items-start">
            <input type="checkbox" className="mt-1" checked={!!done[i]} onChange={() => toggle(i)} />
            <span><b>{who}:</b> {what}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MediaLibrary({ api, base, token, user, setMessage }) {
  const [options, setOptions] = useState(null)
  const [denied, setDenied] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setOptions(null); setDenied(''); setSelectedId(null)
    api('GET', `${LIB}/options/`).then(setOptions).catch(e => setDenied(e.message))
  }, [api])

  const refresh = () => setRefreshKey(k => k + 1)

  if (denied) {
    return (
      <Section title="Media library">
        <p className="text-sm">The API refused: <b>{denied}</b></p>
        <p className="text-sm text-gray-600 mt-1">For a citizen or media analyst this 403 is the expected result: they have no library.</p>
      </Section>
    )
  }
  if (!options) return <p className="text-sm text-gray-600">Loading options...</p>
  return (
    <>
      <WhoAmI user={user} options={options} />
      <Upload api={api} base={base} token={token} options={options} onUploaded={a => { refresh(); setSelectedId(a.id) }} setMessage={setMessage} />
      <Library api={api} base={base} token={token} options={options} refreshKey={refreshKey} selectedId={selectedId} onSelect={setSelectedId} setMessage={setMessage} />
      {selectedId && <Detail key={selectedId} api={api} base={base} token={token} options={options} assetId={selectedId} onChanged={refresh} onSelect={setSelectedId} setMessage={setMessage} />}
      <FieldReports api={api} base={base} token={token} user={user} options={options} onImported={refresh} setMessage={setMessage} />
      <Checklist />
    </>
  )
}
