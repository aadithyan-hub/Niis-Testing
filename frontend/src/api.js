// Tiny fetch wrapper: adds the Bearer token, parses JSON, logs every call.

function errorText(data) {
  if (!data) return ''
  if (typeof data === 'string') {
    // Django error pages are HTML: show their <title>, not the markup.
    const title = data.match(/<title>([\s\S]*?)<\/title>/i)
    return (title ? title[1].trim() : data).slice(0, 300)
  }
  if (data.detail) return String(data.detail)
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' ') : JSON.stringify(value)}`)
    .join(' | ')
}

export { errorText }

export function makeApi(base, token, onLog) {
  // `extraHeaders`: e.g. the mobile app's X-Platform / X-Recaptcha-Token.
  return async function call(method, path, body, extraHeaders) {
    const url = base.replace(/\/$/, '') + path
    // FormData (file uploads) goes as multipart: the browser sets the boundary.
    const isForm = body instanceof FormData
    let res
    try {
      res = await fetch(url, {
        method,
        headers: {
          ...(isForm ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(extraHeaders || {}),
        },
        body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
      })
    } catch (e) {
      onLog({ time: new Date().toLocaleTimeString(), method, path, status: 'NETWORK', data: String(e) })
      throw new Error(`Cannot reach ${url} - is run-backend.bat running?`)
    }
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    onLog({ time: new Date().toLocaleTimeString(), method, path, status: res.status, data })
    if (!res.ok) throw new Error(errorText(data) || `HTTP ${res.status}`)
    return data
  }
}
