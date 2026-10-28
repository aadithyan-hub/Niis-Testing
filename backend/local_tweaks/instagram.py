"""Local testing only: a simulated Instagram for the Social posting tab, and
a guard so this tester can never publish to a real Instagram account.

Every Graph API call NIIS makes goes through social.services.facebook._graph.
install() wraps that one function:

- A call made with a token starting with "SIM" (or about one, for
  debug_token and the token exchange) never leaves this computer: the fake
  Meta below answers it. Connect an Instagram account with a SIM token and
  everything for it - connect, token check, posting, retries, figures - is
  simulated.
- With any other (real) token, reading goes to the real Graph API as usual
  (connect, verify, the daily limit), but Instagram's two publishing calls
  (POST .../media and POST .../media_publish) are BLOCKED here and never sent.
  Facebook posting (/feed, /photos) is not touched.

The fake checks the image the way Instagram does (it downloads it from the
local nginx: JPEG, at most 8 MB, shape 4:5 to 1.91:1), so the tab shows what
Instagram would receive. The outcome switch on the tab makes Instagram slow,
refuse the image, hit the daily limit, lose a reply, reject the token or be
unreachable.

State is kept in backend/instagram_sim.json (git-ignored) so the backend and
run-due-posts.bat see the same switch. None of this exists in niis-api.
"""
import io
import json
import logging
import os
import re
import threading
import time
from pathlib import Path

import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger('local_tweaks.instagram')

STATE_FILE = Path(os.environ.get('INSTAGRAM_SIM_STATE')
                  or Path(__file__).resolve().parent.parent / 'instagram_sim.json')
_lock = threading.Lock()

SIM_IG_ID = '17841499999999999'
SIM_PAGE_ID = '990000000000001'
OTHER_IG_ID = '17841400000000042'
SIM_USERNAME = 'simulated_dipr'
SIM_SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement',
              'pages_show_list', 'business_management']

#: What the fake Instagram does with the next calls (the tab's switch).
OUTCOMES = {
    'ok': 'Works: the image is accepted and the post is published at once',
    'slow': 'Instagram is still processing the image (the post waits and retries)',
    'image_error': 'Instagram cannot process the image (container status ERROR)',
    'limit': 'The 100 posts a day limit is reached',
    'lost_reply': 'Published, but the reply is lost (the retry must NOT post twice)',
    'token_dead': 'The token was revoked (code 190)',
    'down': 'Instagram cannot be reached',
}

#: Tokens to type on the tab (anything starting with SIM is simulated).
TOKENS = {
    'SIM-USER': 'user token of a Page manager: works',
    'SIM-PAGE': "the linked Page's own token: works",
    'SIM-USER-EXPIRING': 'works, but its data access ends in 3 days (status expiring)',
    'SIM-USER-NOPERM': 'missing the instagram_content_publish permission',
    'SIM-USER-NOTLINKED': 'its Page is linked to another Instagram account',
    'SIM-EXPIRED': 'expired / revoked token',
}

BLOCKED_ERROR = ('Blocked by the local tester: Instagram posting is never sent from this '
                 'computer. To test posting, connect an Instagram account with a SIM '
                 'token (see the Simulated Instagram section).')

_real_graph = None


# ── State ────────────────────────────────────────────────────────────────────

def _empty_state():
    return {'outcome': 'ok', 'next_id': 1, 'containers': {}, 'media': {}, 'log': []}


def _load():
    try:
        return json.loads(STATE_FILE.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return _empty_state()


def _save(state):
    tmp = STATE_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(state, indent=1), encoding='utf-8')
    tmp.replace(STATE_FILE)


def _log(state, text):
    state['log'].insert(0, {'time': time.strftime('%H:%M:%S'), 'text': text})
    del state['log'][60:]


def _new_id(state, prefix):
    value = f'{prefix}{state["next_id"]}'
    state['next_id'] += 1
    return value


# ── The wrapper around social.services.facebook._graph ───────────────────────

def _is_sim(value):
    return isinstance(value, str) and value.startswith('SIM')


def _is_instagram_publish(method, path):
    return method == 'POST' and re.search(r'/(media|media_publish)$', '/' + path.strip('/'))


def _graph(method, path, *, token, params=None, data=None, sign=True):
    from social.services.facebook import GraphResult

    params, data = params or {}, data or {}
    if any(_is_sim(v) for v in (token, params.get('input_token'),
                                params.get('fb_exchange_token'))):
        return _fake_meta(method, path.strip('/'), token, params, data)
    if _is_instagram_publish(method, path):
        logger.warning('BLOCKED real Instagram call: %s %s', method, path)
        with _lock:
            state = _load()
            _log(state, f'BLOCKED a real Instagram call: {method} /{path.strip("/")} '
                        f'(nothing was sent)')
            _save(state)
        return GraphResult(ok=False, error=BLOCKED_ERROR)
    return _real_graph(method, path, token=token, params=params, data=data, sign=sign)


def install():
    """Called from LocalTweaksConfig.ready()."""
    global _real_graph
    from social.services import facebook

    if _real_graph is None:
        _real_graph = facebook._graph
        facebook._graph = _graph


# ── The fake Meta ────────────────────────────────────────────────────────────

def _flags(token):
    return {flag for flag in ('EXPIRING', 'NOPERM', 'NOTLINKED', 'EXPIRED')
            if flag in (token or '')}


def _fake_meta(method, path, token, params, data):
    from social.services.facebook import GraphResult

    def ok(**body):
        return GraphResult(ok=True, data=body)

    def error(message, code=100, transient=False):
        return GraphResult(ok=False, error=message, code=code, transient=transient,
                           token_invalid=code == 190)

    with _lock:
        state = _load()
        outcome = state['outcome']
        fields = params.get('fields', '')
        try:
            if outcome == 'down':
                _log(state, f'{method} /{path}: Instagram unreachable (simulated)')
                return error('Facebook could not be reached.', code=None, transient=True)

            # Token checks and connecting --------------------------------------
            if path == 'debug_token':
                checked = params['input_token']
                flags = _flags(checked)
                now = int(time.time())
                if 'EXPIRED' in flags or outcome == 'token_dead':
                    return ok(data={'is_valid': False, 'type': 'USER'})
                scopes = [s for s in SIM_SCOPES
                          if not ('NOPERM' in flags and s == 'instagram_content_publish')]
                info = {'is_valid': True, 'scopes': scopes, 'expires_at': 0,
                        'data_access_expires_at': now + (3 if 'EXPIRING' in flags else 90) * 86400}
                if checked.startswith('SIM-PAGE'):
                    info.update(type='PAGE', profile_id=SIM_PAGE_ID)
                else:
                    info.update(type='USER')
                return ok(data=info)

            if outcome == 'token_dead':
                _log(state, f'{method} /{path}: token revoked (simulated)')
                return error('Error validating access token: the session has been '
                             'invalidated (simulated).', code=190)

            if path == 'oauth/access_token':
                return ok(access_token=f'{params["fb_exchange_token"]}-LONG')
            if path == 'me/accounts':
                flags = _flags(token)
                linked = OTHER_IG_ID if 'NOTLINKED' in flags else SIM_IG_ID
                page_token = 'SIM-PAGE' + ''.join(f'-{f}' for f in sorted(flags - {'NOTLINKED'}))
                return ok(data=[
                    {'id': '990000000000002', 'name': 'Another simulated Page',
                     'access_token': 'SIM-PAGE-OTHER'},
                    {'id': SIM_PAGE_ID, 'name': 'Simulated DIPR Page', 'access_token': page_token,
                     'instagram_business_account': {'id': linked}},
                ])
            if path == SIM_PAGE_ID and 'instagram_business_account' in fields:
                return ok(id=SIM_PAGE_ID, name='Simulated DIPR Page',
                          instagram_business_account={'id': SIM_IG_ID})
            if path in (SIM_IG_ID, OTHER_IG_ID) and 'username' in fields:
                return ok(id=path, username=SIM_USERNAME, name='Simulated DIPR')

            # Posting --------------------------------------------------------
            if path.endswith('/content_publishing_limit'):
                day_ago = time.time() - 86400
                used = sum(1 for m in state['media'].values() if m['published'] > day_ago)
                if outcome == 'limit':
                    used = 100
                return ok(data=[{'quota_usage': used,
                                 'config': {'quota_total': 100, 'quota_duration': 86400}}])

            if method == 'POST' and path.endswith('/media'):
                problem = _check_image(data.get('image_url', ''))
                if problem:
                    _log(state, f'container refused: {problem}')
                    return error(problem, code=9004)
                container_id = _new_id(state, 'SIMC-')
                state['containers'][container_id] = {
                    'id': container_id, 'image_url': data.get('image_url', ''),
                    'caption': data.get('caption', ''), 'created': time.time(),
                    'status': 'ERROR' if outcome == 'image_error' else 'IN_PROGRESS',
                    'checks': 0, 'media_id': None,
                }
                _log(state, f'container {container_id} created (caption '
                            f'{len(data.get("caption", ""))} characters)')
                return ok(id=container_id)

            if path in state['containers'] and 'status_code' in fields:
                container = state['containers'][path]
                container['checks'] += 1
                if container['status'] == 'IN_PROGRESS' and outcome != 'slow':
                    container['status'] = 'FINISHED'
                status_text = ('Error: the image could not be processed (simulated 2207026)'
                               if container['status'] == 'ERROR' else container['status'])
                return ok(id=path, status_code=container['status'], status=status_text)

            if method == 'POST' and path.endswith('/media_publish'):
                container = state['containers'].get(data.get('creation_id'))
                if not container:
                    return error('Invalid creation_id (simulated).')
                if container['status'] == 'PUBLISHED':
                    return error('This media has already been published (simulated).', code=9007)
                if container['status'] != 'FINISHED':
                    return error('Media ID is not available (simulated 2207027).', code=9007)
                media_id = _new_id(state, 'SIMM-')
                container.update(status='PUBLISHED', media_id=media_id)
                state['media'][media_id] = {'id': media_id, 'container': container['id'],
                                            'published': time.time(), 'fetches': 0}
                if outcome == 'lost_reply':
                    _log(state, f'{container["id"]} PUBLISHED as {media_id}, but the reply '
                                f'was lost (simulated)')
                    return error('An unexpected error has occurred. Please retry your '
                                 'request later (simulated lost reply).', code=2, transient=True)
                _log(state, f'{container["id"]} PUBLISHED as {media_id} (simulated - '
                            f'nothing was posted anywhere)')
                return ok(id=media_id)

            if path in state['media']:
                media = state['media'][path]
                media['fetches'] += 1
                return ok(id=path, permalink=f'https://www.instagram.com/p/{path}-simulated/',
                          like_count=3 * media['fetches'], comments_count=media['fetches'])

            _log(state, f'unexpected simulated call {method} /{path} {fields}')
            return error(f'The simulated Instagram does not know {method} /{path}.')
        finally:
            _save(state)


def _check_image(image_url):
    """What Instagram checks when it downloads the image of a container."""
    from PIL import Image

    try:
        response = requests.get(image_url, timeout=10)
    except requests.RequestException as exc:
        return f'Media download has failed: {type(exc).__name__} (is run-storage.bat running?)'
    if response.status_code != 200:
        return f'Media download has failed: HTTP {response.status_code} for {image_url}'
    body = response.content
    if len(body) > 8 * 1024 * 1024:
        return f'The image is {len(body)} bytes; Instagram takes at most 8 MB.'
    try:
        img = Image.open(io.BytesIO(body))
        fmt, (width, height) = img.format, img.size
    except Exception:  # noqa: BLE001 - shown on the tab
        return 'The downloaded file is not an image.'
    if fmt != 'JPEG':
        return f'The image is {fmt}; Instagram takes JPEG only.'
    if not 0.8 <= width / height <= 1.91:
        return (f'The image is {width}x{height} (ratio {width / height:.3f}); Instagram '
                f'takes 4:5 (0.8) to 1.91:1.')
    return None


# ── The tab's controls (local_urls.py) ───────────────────────────────────────

def snapshot():
    from django.conf import settings

    from social.services import facebook

    state = _load()
    containers = sorted(state['containers'].values(), key=lambda c: -c['created'])
    return {
        'outcome': state['outcome'], 'outcomes': OUTCOMES, 'tokens': TOKENS,
        'sim_ig_id': SIM_IG_ID, 'guard_installed': facebook._graph is _graph,
        'storage_base': settings.MINIO_PUBLIC_URL.rstrip('/') + '/',
        'containers': containers[:30], 'log': state['log'],
    }


def set_outcome(outcome):
    with _lock:
        state = _load()
        if outcome in OUTCOMES:
            state['outcome'] = outcome
            _log(state, f'outcome switched to "{outcome}"')
        _save(state)


def reset():
    with _lock:
        _save(_empty_state())


@csrf_exempt
def state_view(request):
    """GET: the switch, the containers Instagram "received" and the log.
    POST {"outcome": ...} or {"reset": true}."""
    if request.method == 'POST':
        body = json.loads(request.body or '{}')
        if body.get('reset'):
            reset()
        if body.get('outcome'):
            set_outcome(body['outcome'])
    return JsonResponse(snapshot())


@csrf_exempt
def run_due_view(request):
    """POST {"minutes": N, "metrics": bool}: what Celery beat does, now, as if
    N minutes had passed (a retry waits 5, then 15 minutes). Sends every due
    post - Facebook ones too."""
    from datetime import timedelta

    from django.utils import timezone

    from social.services.publishing import publish_due, refresh_metrics

    body = json.loads(request.body or '{}')
    minutes = max(0, min(int(body.get('minutes') or 0), 24 * 60))
    now = timezone.now() + timedelta(minutes=minutes)
    result = {'minutes_ahead': minutes, 'publish_due': publish_due(now)}
    if body.get('metrics'):
        result['refresh_metrics'] = refresh_metrics(now)
    return JsonResponse(result)
