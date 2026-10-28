// Social posting tab, Instagram part: the simulated Instagram of the local
// backend (backend/local_tweaks/instagram.py). Nothing here reaches Instagram:
// SIM tokens are answered on this computer, and posting with a real token is
// blocked by the backend.
import { useCallback, useEffect, useState } from 'react'

function Btn({ children, className = '', ...props }) {
  return (
    <button className={`px-3 py-1 rounded border border-gray-400 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-sm ${className}`} {...props}>
      {children}
    </button>
  )
}

function Section({ title, children, right }) {
  return (
    <section className="border border-pink-300 rounded p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

const STATUS_COLORS = {
  FINISHED: 'bg-blue-100 text-blue-800', PUBLISHED: 'bg-green-100 text-green-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800', ERROR: 'bg-red-100 text-red-800',
}

// Shows the size the browser measured, and whether Instagram would take it.
function ImageInfo({ url }) {
  const [size, setSize] = useState(null)
  const ratio = size ? size.w / size.h : null
  const okShape = ratio !== null && ratio >= 0.8 && ratio <= 1.91
  return (
    <div className="space-y-1">
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="" className="h-28 border bg-gray-100"
          onLoad={e => setSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
      </a>
      {size && (
        <div className={`text-xs ${okShape ? 'text-green-700' : 'text-red-700'}`}>
          {size.w} x {size.h}, ratio {ratio.toFixed(3)} {okShape ? '(in 0.8 - 1.91)' : '(outside 0.8 - 1.91)'}
        </div>
      )}
    </div>
  )
}

function Checklist() {
  const steps = [
    ['Connect', 'testadmin: section 1, platform "Instagram account", Fill simulated, Connect. The row shows instagram, @simulated_dipr, token valid. Verify keeps it valid.'],
    ['Wrong tokens', 'Connect again with SIM-USER-NOPERM, SIM-USER-NOTLINKED, SIM-EXPIRED: each gives a readable 400 and connects nothing. SIM-USER-EXPIRING connects with token "expiring".'],
    ['Image cases', 'testeditor or testadmin: post each "IG test:" article to the simulated account (outcome "Works"). In section 4 each container image is a JPEG with the ratio in 0.8 - 1.91: tall poster with white bars at the sides, wide banner 1440 wide with bars above and below, transparent PNG on white, GIF as a still. Open the GPS photo copy: no location (check its EXIF in any viewer).'],
    ['Refused', '"no image" and "image outside NIIS" to Instagram: 400 with a readable message, no post created. The same "no image" article to Facebook is allowed (text post).'],
    ['Caption', '"long caption": the container caption is 2,200 characters, ends with "…" and then the article link.'],
    ['Waits for approval', '"in review" to Instagram: the post stays scheduled. Approve (editor) in section 2: it is published.'],
    ['Still processing', 'Outcome "Instagram is still processing", post: it waits ("still processing", attempt 1). Switch to "Works", press "Send due posts +6 min": published with the SAME container (no second container in section 4).'],
    ['No double post', 'Outcome "Published, but the reply is lost", post: it waits. Press "+6 min": it fails with "already published ... it was not sent again", and section 4 shows one container only.'],
    ['Image refused', 'Outcome "cannot process the image", post: failed with "Instagram could not process the image". Retry after switching back to "Works": published.'],
    ['Daily limit', 'Outcome "limit reached", post: waits with "100 posts a day"; no container is made.'],
    ['Token revoked', 'Outcome "token revoked", post: the post waits and the account turns invalid (testadmin gets an in-app notice). Back to "Works", Replace token with SIM-USER: the waiting post goes out on the next "Send due posts".'],
    ['Unreachable', 'Outcome "cannot be reached", Verify: the status stays and last error says why. A post waits to retry.'],
    ['Figures', 'Press "Refresh likes/comments": published Instagram posts show likes / comments; shares stay n/a.'],
    ['Facebook untouched', 'With both connected and no account chosen ("no account_id"), a post goes to the Facebook Page. Choosing the Instagram account posts there.'],
    ['Real account guard', 'Connecting a real Instagram account works only if this computer reaches graph.facebook.com. Any post to it ends failed "Blocked by the local tester"; section 4 log shows BLOCKED. Nothing is sent.'],
  ]
  return (
    <details className="text-sm" open>
      <summary className="font-medium cursor-pointer">5. What to check (Instagram)</summary>
      <ol className="list-decimal ml-5 mt-2 space-y-1">
        {steps.map(([title, text]) => <li key={title}><b>{title}.</b> {text}</li>)}
      </ol>
    </details>
  )
}

export default function InstagramSim({ api, onChange, onRan, setMessage, refreshKey }) {
  const [sim, setSim] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastRun, setLastRun] = useState(null)

  const load = useCallback(async (body) => {
    try {
      const data = await api(body ? 'POST' : 'GET', '/local/instagram/state/', body)
      setSim(data)
      onChange(data)
    } catch (e) {
      setMessage({ ok: false, text: `Simulated Instagram: ${e.message}` })
    }
  }, [api, onChange, setMessage])

  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    const id = setInterval(() => load(), 5000)
    return () => clearInterval(id)
  }, [load])

  const runDue = async (minutes, metrics = false) => {
    setBusy(true)
    try {
      const data = await api('POST', '/local/instagram/run-due/', { minutes, metrics })
      setLastRun(data)
      setMessage({ ok: true, text: `Sent due posts${minutes ? ` as if ${minutes} min later` : ''}: ${JSON.stringify(data.publish_due)}${data.refresh_metrics ? ` | figures: ${JSON.stringify(data.refresh_metrics)}` : ''}` })
      onRan()
      await load()
    } catch (e) {
      setMessage({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (!sim) return <Section title="4. Simulated Instagram"><p className="text-sm">Loading...</p></Section>

  return (
    <Section title="4. Simulated Instagram (nothing leaves this computer)" right={
      <div className="flex gap-2">
        <Btn onClick={() => load()}>Reload</Btn>
        <Btn onClick={() => window.confirm('Forget every simulated container and the log?') && load({ reset: true })}>Reset</Btn>
      </div>
    }>
      <div className="space-y-4 text-sm">
        <div className={`p-2 rounded ${sim.guard_installed ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
          {sim.guard_installed
            ? 'Guard on: SIM tokens are answered here, and posting to a real Instagram account is blocked before it leaves this computer.'
            : 'Guard NOT installed - do not post to Instagram from this tester. Restart run-backend.bat.'}
        </div>

        <div>
          <div className="font-medium mb-1">What the simulated Instagram does next</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {Object.entries(sim.outcomes).map(([key, text]) => (
              <label key={key} className={`flex items-start gap-2 p-1 rounded ${sim.outcome === key ? 'bg-pink-50' : ''}`}>
                <input type="radio" name="ig-outcome" checked={sim.outcome === key} onChange={() => load({ outcome: key })} />
                <span><code className="text-xs">{key}</code> {text}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-medium mb-1">Tokens (Instagram account ID <code>{sim.sim_ig_id}</code>)</div>
            <table className="text-xs w-full">
              <tbody>
                {Object.entries(sim.tokens).map(([token, text]) => (
                  <tr key={token} className="border-b"><td className="pr-2 font-mono py-0.5">{token}</td><td>{text}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="font-medium mb-1">What Celery beat does on the server</div>
            <div className="flex flex-wrap gap-2">
              <Btn disabled={busy} onClick={() => runDue(0)}>Send due posts now</Btn>
              <Btn disabled={busy} onClick={() => runDue(6)}>... as if +6 min (retry 2)</Btn>
              <Btn disabled={busy} onClick={() => runDue(21)}>... as if +21 min (retry 3)</Btn>
              <Btn disabled={busy} onClick={() => runDue(0, true)}>Refresh likes/comments</Btn>
            </div>
            <p className="text-xs text-gray-600 mt-1">Sends every due post, Facebook ones too. A retry waits 5, then 15 minutes.</p>
            {lastRun && <pre className="text-xs bg-gray-50 p-1 mt-1">{JSON.stringify(lastRun)}</pre>}
          </div>
        </div>

        <div>
          <div className="font-medium mb-1">What Instagram received (containers, newest first)</div>
          {sim.containers.length === 0 && <p className="text-gray-600">Nothing yet.</p>}
          {sim.containers.length > 0 && (
            <table className="w-full text-xs">
              <thead><tr className="text-left border-b"><th>Container</th><th>Image Instagram downloaded</th><th>Caption</th></tr></thead>
              <tbody>
                {sim.containers.map(c => (
                  <tr key={c.id} className="border-b align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">
                      <div className="font-mono">{c.id}</div>
                      <span className={`px-2 py-0.5 rounded ${STATUS_COLORS[c.status] || 'bg-gray-100'}`}>{c.status}</span>
                      {c.media_id && <div className="font-mono mt-1">{c.media_id}</div>}
                      <div className="text-gray-500">status checks: {c.checks}</div>
                    </td>
                    <td className="pr-2"><ImageInfo url={c.image_url} /></td>
                    <td>
                      <div className="text-gray-500">{c.caption.length} characters</div>
                      <pre className="whitespace-pre-wrap max-h-28 overflow-auto bg-gray-50 p-1 max-w-md">{c.caption}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <details>
          <summary className="font-medium cursor-pointer">Simulator log ({sim.log.length})</summary>
          <ul className="text-xs font-mono mt-1 space-y-0.5 max-h-48 overflow-auto">
            {sim.log.map((line, i) => (
              <li key={i} className={line.text.startsWith('BLOCKED') ? 'text-red-700 font-bold' : ''}>{line.time} {line.text}</li>
            ))}
          </ul>
        </details>

        <Checklist />
      </div>
    </Section>
  )
}
