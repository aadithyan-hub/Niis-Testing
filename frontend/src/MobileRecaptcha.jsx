// Throwaway tester for the mobile apps' reCAPTCHA Enterprise check
// (niis-api core.antiautomation.check_mobile_captcha). Not production code.
//
// It plays the Android / iOS app: it sends the app's headers (X-Platform,
// X-Recaptcha-Token) to the real NIIS endpoints. A browser cannot make a real
// app token, so the "Google" switch (backend/local_tweaks/recaptcha.py) can
// answer with a simulated verdict to try the paths where the token passes.
import { useCallback, useEffect, useState } from 'react'
import { makeApi } from './api.js'

const LOCAL = '/local/recaptcha'

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

function Tag({ children, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700', blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800',
    green: 'bg-green-100 text-green-800',
  }
  return <span className={`px-1.5 py-0.5 rounded text-xs ${tones[tone]}`}>{children}</span>
}

function Choice({ value, options, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(([key, label]) => (
        <Btn key={key} onClick={() => onChange(key)} className={value === key ? primary : ''}>{label}</Btn>
      ))}
    </div>
  )
}

// The tab's own switches: quiet calls, not shown in the API log.
async function local(base, method, path, body) {
  const res = await fetch(base.replace(/\/$/, '') + LOCAL + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${LOCAL}${path} answered ${res.status} - is run-backend.bat running the latest code?`)
  return res.json()
}

const randomPhone = () => `98765${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`

// ── 1. Server switches ──────────────────────────────────────────────────────
function Switches({ base, state, setState, setMessage }) {
  const [probe, setProbe] = useState(null)
  const [busy, setBusy] = useState(false)

  const change = async body => {
    try { setState(await local(base, 'POST', '/state/', body)) } catch (e) { setMessage({ ok: false, text: e.message }) }
  }
  const runProbe = async () => {
    setBusy(true); setProbe(null)
    try { setProbe((await local(base, 'POST', '/probe/')).results) } catch (e) { setMessage({ ok: false, text: e.message }) }
    setBusy(false)
  }

  const c = state.config
  const sim = state.simulated
  return (
    <Section title="1. Server switches (local only, no restart needed)">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-3">
          <div>
            <div className="font-medium">Mode <span className="text-gray-500 font-normal">(RECAPTCHA_MOBILE_MODE)</span></div>
            <Choice value={state.mode_effective} onChange={mode => change({ mode })} options={[
              ['off', 'off - no check'], ['monitor', 'monitor - log only'], ['enforce', 'enforce - block'],
            ]} />
          </div>
          <div>
            <div className="font-medium">Google answers</div>
            <Choice value={state.google} onChange={google => change({ google })} options={[
              ['real', 'real Google'], ['simulated', 'simulated'], ['down', 'down (unreachable)'],
            ]} />
            <p className="text-xs text-gray-500 mt-1">
              Real Google always refuses a token from a browser (only the app's SDK can make one), so use
              "simulated" to try a passing token.
            </p>
          </div>
          {state.google === 'simulated' && (
            <div className="border border-dashed border-gray-400 rounded p-2 space-y-2">
              <div className="font-medium">Simulated answer</div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sim.valid} onChange={e => change({ simulated: { valid: e.target.checked } })} />
                token valid
              </label>
              {!sim.valid && (
                <label className="block">reason
                  <select className={input} value={sim.invalid_reason} onChange={e => change({ simulated: { invalid_reason: e.target.value } })}>
                    {['EXPIRED', 'DUPE', 'MALFORMED', 'MISSING', 'BROWSER_ERROR'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-3 gap-2">
                <label>score
                  <input className={input} type="number" step="0.1" min="0" max="1" defaultValue={sim.score}
                    onBlur={e => change({ simulated: { score: Number(e.target.value) } })} />
                </label>
                <label>action (empty = correct)
                  <input className={input} defaultValue={sim.action} placeholder="(matches)"
                    onBlur={e => change({ simulated: { action: e.target.value.trim() } })} />
                </label>
                <label>app
                  <input className={input} defaultValue={sim.app_id}
                    onBlur={e => change({ simulated: { app_id: e.target.value.trim() } })} />
                </label>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 items-end">
            <label>Score needed
              <input className={input} type="number" step="0.1" min="0" max="1" defaultValue={c.min_score}
                onBlur={e => change({ min_score: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={c.fail_open} onChange={e => change({ fail_open: e.target.checked })} />
              let through when Google is down
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <table className="w-full text-xs">
            <tbody>
              {[
                ['Project', c.project || 'EMPTY'],
                ['Credentials file', c.credentials_found ? 'found' : `NOT FOUND (${c.credentials_path || 'not set'})`],
                ['Android key', c.android_key || 'EMPTY'],
                ['iOS key', c.ios_key || 'EMPTY'],
                ['App (package / bundle)', c.app_id || '(not checked)'],
                ['Per-action scores', Object.keys(c.action_scores || {}).length ? JSON.stringify(c.action_scores) : 'none'],
                ['Google timeout', `${c.timeout}s`],
                ['Demo phone (exempt)', state.demo.enabled ? `${state.demo.phone} / code ${state.demo.otp}` : 'off'],
                ['Website CAPTCHA', `${c.web_captcha_secret_set ? 'secret set' : 'no secret'}, required for OTP: ${c.captcha_required_for_otp}`],
              ].map(([k, v]) => (
                <tr key={k} className="border-b"><td className="py-0.5 pr-2 text-gray-500">{k}</td><td className="font-mono break-all">{v}</td></tr>
              ))}
            </tbody>
          </table>
          {state.gaps.length > 0 && <div className="text-xs text-red-700">Missing: {state.gaps.join('; ')}</div>}
          <Btn disabled={busy} onClick={runProbe}>{busy ? 'Asking Google...' : 'Test Google connection (real)'}</Btn>
          {probe && probe.map(p => (
            <div key={p.platform} className="text-xs">
              <Tag tone={p.ok ? 'green' : 'red'}>{p.platform}</Tag>{' '}
              {p.ok ? `Google answered (dummy token → ${p.answer}): key, API and credentials are good` : p.answer}
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── 2. Be the app ───────────────────────────────────────────────────────────
function BeTheApp({ base, onLog, demo }) {
  const [platform, setPlatform] = useState('android')
  const [token, setToken] = useState('token-from-the-browser')
  const [noToken, setNoToken] = useState(false)
  const [phone, setPhone] = useState(randomPhone)
  const [otpRef, setOtpRef] = useState('')
  const [code, setCode] = useState('')
  const [citizen, setCitizen] = useState('')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin@123')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  const headers = () => (platform === 'website' ? {} : {
    'X-Platform': platform,
    ...(noToken ? {} : { 'X-Recaptcha-Token': token }),
  })

  // Calls go through makeApi so they appear in the API log; failures are results here, not errors.
  // No bearer token except the citizen's for the grievance, as from a fresh app install.
  const call = async (label, method, path, body, bearer) => {
    setBusy(true)
    const sent = headers()
    let status = 'ok'
    let data = null
    try {
      data = await makeApi(base, bearer || '', onLog)(method, path, body, sent)
    } catch (e) {
      status = 'error'; data = { detail: e.message }
    }
    setResults(r => [{
      time: new Date().toLocaleTimeString(), label, status,
      sent: Object.keys(sent).length ? Object.entries(sent).map(([k, v]) => `${k}: ${v}`).join(', ') : 'no app headers (website)',
      detail: data?.detail || (status === 'ok' ? 'OK' : ''),
    }, ...r].slice(0, 20))
    setBusy(false)
    return status === 'ok' ? data : null
  }

  const sendOtp = async () => {
    const data = await call('Send OTP', 'POST', '/api/v1/auth/send-otp/', { identifier: phone, type: 'login' })
    if (data) { setOtpRef(data.otp_ref); setCode(data.dev_otp || (phone === demo.phone ? demo.otp : '')) }
  }
  const verifyOtp = async () => {
    const data = await call('Verify OTP', 'POST', '/api/v1/auth/verify-otp/', { otp_ref: otpRef, otp: code })
    if (data?.access_token) setCitizen(data.access_token)
  }
  const submitGrievance = () => call('Submit grievance', 'POST', '/api/v1/grievances/', {
    title: `App test ${new Date().toLocaleTimeString()}`,
    description: 'Submitted from the Mobile reCAPTCHA tab of the local tester.',
    category: 'Infrastructure', district: 'Kohima',
  }, citizen)
  const officerLogin = () => call('Officer login', 'POST', '/api/v1/auth/login/', {
    username, password, captcha_token: 'local-test',
  })

  return (
    <Section title="2. Be the app">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-3">
          <div>
            <div className="font-medium">Send as</div>
            <Choice value={platform} onChange={setPlatform} options={[
              ['android', 'Android app'], ['ios', 'iOS app'], ['website', 'Website (no X-Platform)'],
            ]} />
          </div>
          {platform !== 'website' && (
            <div className="grid grid-cols-3 gap-2 items-end">
              <label className="col-span-2">X-Recaptcha-Token
                <input className={input} value={token} disabled={noToken} onChange={e => setToken(e.target.value)} />
              </label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={noToken} onChange={e => setNoToken(e.target.checked)} /> send no token</label>
            </div>
          )}

          <div className="border-t pt-2 space-y-2">
            <div className="font-medium">Citizen: OTP login, then a grievance</div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <label className="col-span-2">Phone
                <input className={input} value={phone} onChange={e => setPhone(e.target.value)} />
              </label>
              <div className="flex gap-1">
                <Btn onClick={() => setPhone(randomPhone())}>new</Btn>
                {demo.enabled && <Btn onClick={() => setPhone(demo.phone)}>demo</Btn>}
              </div>
            </div>
            <Btn disabled={busy || !phone} onClick={sendOtp} className={primary}>a. Send OTP</Btn>
            <div className="grid grid-cols-3 gap-2 items-end">
              <label className="col-span-2">OTP (filled in by send-otp)
                <input className={input} value={code} onChange={e => setCode(e.target.value)} />
              </label>
              <Btn disabled={busy || !otpRef} onClick={verifyOtp} className={primary}>b. Verify OTP</Btn>
            </div>
            <div className="flex items-center gap-2">
              <Btn disabled={busy || !citizen} onClick={submitGrievance} className={primary}>c. Submit grievance</Btn>
              <span className="text-xs text-gray-500">{citizen ? 'logged in as the citizen from b.' : 'needs b. first'}</span>
            </div>
          </div>

          <div className="border-t pt-2 space-y-2">
            <div className="font-medium">Officer login</div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <label>Username<input className={input} value={username} onChange={e => setUsername(e.target.value)} /></label>
              <label>Password<input className={input} type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
              <Btn disabled={busy} onClick={officerLogin} className={primary}>d. Officer login</Btn>
            </div>
          </div>
        </div>

        <div>
          <div className="font-medium mb-1">Results <Btn className="ml-2" onClick={() => setResults([])}>Clear</Btn></div>
          {results.length === 0 && <p className="text-xs text-gray-500">Nothing sent yet.</p>}
          <div className="space-y-1">
            {results.map((r, i) => (
              <div key={i} className={`text-xs border rounded p-1.5 ${r.status === 'ok' ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                <b>{r.time} {r.label}</b> → {r.status === 'ok' ? 'allowed' : 'refused'}: {r.detail}
                <div className="text-gray-500">{r.sent}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">The status code of each call is in the API log at the bottom.</p>
        </div>
      </div>
    </Section>
  )
}

// ── 3. Server log ───────────────────────────────────────────────────────────
function ServerLog({ base, log, setState }) {
  const tone = level => (level === 'INFO' ? 'green' : level === 'WARNING' ? 'amber' : 'red')
  return (
    <Section title="3. What the backend logged (CAPTCHA lines)" right={
      <Btn onClick={async () => { await local(base, 'POST', '/log/clear/'); setState(s => ({ ...s, log: [] })) }}>Clear</Btn>
    }>
      {log.length === 0 && <p className="text-xs text-gray-500">No CAPTCHA log lines yet. In "off" mode, and for website requests, there are none.</p>}
      <div className="space-y-0.5 max-h-72 overflow-auto font-mono text-xs">
        {log.map((l, i) => (
          <div key={i}><span className="text-gray-500">{l.time}</span> <Tag tone={tone(l.level)}>{l.level}</Tag> {l.message}</div>
        ))}
      </div>
    </Section>
  )
}

// ── 4. Checklist ────────────────────────────────────────────────────────────
const CHECKS = [
  ['real Google', '"Test Google connection": android and ios both answer MALFORMED. That means the key, the API and the credentials are good.'],
  ['monitor + real', 'Android: Send OTP is allowed. The log shows "Mobile CAPTCHA failed ... reason=invalid:MALFORMED mode=monitor" (logged, not blocked).'],
  ['enforce + real', 'Android and iOS: Send OTP is refused, "Security check failed. Please try again." (403).'],
  ['enforce', '"send no token": refused, log says reason=missing_token.'],
  ['enforce', 'Website (no X-Platform): Send OTP is allowed and nothing is logged. The website is unchanged.'],
  ['enforce + simulated (valid, 0.9)', 'a. Send OTP → b. Verify OTP → c. Submit grievance: all allowed. The log shows "passed" with the score.'],
  ['enforce + simulated', 'score 0.3 → low_score; action "other" → action_mismatch; app "com.fake.app" → app_mismatch; untick valid → invalid:EXPIRED. All refused.'],
  ['enforce + simulated (0.9)', 'Set "Score needed" to 0.95 → refused. Set it back to 0.5.'],
  ['enforce + down', 'Refused with "temporarily unavailable" (503). Tick "let through when Google is down" → allowed, log says "unavailable". Untick it.'],
  ['enforce + real', 'iOS, "demo" phone, no token: Send OTP and Verify OTP (code filled in) are allowed. The demo account is exempt.'],
  ['enforce', 'Send OTP as Website, then Verify OTP as Android with real Google → refused. Switch to simulated (valid) and Verify OTP again with the same code → allowed (the refused try used up nothing).'],
  ['enforce', 'd. Officer login as Android: refused with real Google, allowed with simulated (valid).'],
  ['off', 'Everything is allowed and nothing is logged.'],
  ['Swagger', 'http://127.0.0.1:8001/api/docs/ → Auth → send-otp shows the X-Platform and X-Recaptcha-Token headers.'],
]

function Checklist() {
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem('niis-recaptcha-checks') || '{}') } catch { return {} } })
  const toggle = i => setDone(d => { const n = { ...d, [i]: !d[i] }; try { localStorage.setItem('niis-recaptcha-checks', JSON.stringify(n)) } catch { /* private mode */ } return n })
  return (
    <Section title="4. What to check" right={<span className="text-xs text-gray-500">{Object.values(done).filter(Boolean).length}/{CHECKS.length}</span>}>
      <ol className="text-sm space-y-1">
        {CHECKS.map(([when, what], i) => (
          <li key={i} className="flex gap-2 items-start">
            <input type="checkbox" className="mt-1" checked={!!done[i]} onChange={() => toggle(i)} />
            <span><b>{when}:</b> {what}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MobileRecaptcha({ base, onLog, setMessage }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setState(await local(base, 'GET', '/state/')); setError('') } catch (e) { setError(e.message) }
  }, [base])

  useEffect(() => {
    load()
    const id = setInterval(load, 3000)   // keeps the server log fresh
    return () => clearInterval(id)
  }, [load])

  if (!state) {
    return <Section title="Mobile reCAPTCHA"><p className="text-sm">{error || 'Loading...'}</p></Section>
  }
  return (
    <>
      <p className="text-sm text-gray-600">
        No login needed: these endpoints are public (the grievance uses the citizen logged in at step b).
        The real Android / iOS apps send the same two headers.
      </p>
      <Switches base={base} state={state} setState={setState} setMessage={setMessage} />
      <BeTheApp base={base} onLog={onLog} demo={state.demo} />
      <ServerLog base={base} log={state.log} setState={setState} />
      <Checklist />
    </>
  )
}
