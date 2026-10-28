"""Local testing only: controls for the Mobile reCAPTCHA tab.

A browser cannot make a real Android/iOS reCAPTCHA token (only the app's SDK
can), so with real Google every token from this tester is refused. To try the
"pass" paths as well, "Google" can be switched to:

- real       - the live reCAPTCHA Enterprise API with backend/keys/recaptcha-service-account.json
- simulated  - a fake answer built from the values set on the tab (valid, score, action, app)
- down       - as if Google could not be reached

The mode (off / monitor / enforce) and a few other settings can also be
changed here without restarting. The CAPTCHA log lines the backend writes are
kept so the tab can show them.

None of this exists in niis-api: these views are only in local_urls.py.
"""
import collections
import itertools
import json
import logging
import os
import time

import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

import core.antiautomation as aa

_real_create = aa.create_mobile_assessment
_counter = itertools.count(1)

STATE = {
    'google': 'real',
    'simulated': {
        'valid': True, 'invalid_reason': 'EXPIRED', 'action': '',
        'app_id': 'com.dipr.niis', 'score': 0.9,
    },
}
LOG = collections.deque(maxlen=100)


class _Capture(logging.Handler):
    def emit(self, record):
        message = record.getMessage()
        if 'CAPTCHA' in message:
            LOG.appendleft({'time': time.strftime('%H:%M:%S'),
                            'level': record.levelname, 'message': message})


def _create(token, platform, action):
    """Stands in for core.antiautomation.create_mobile_assessment."""
    if STATE['google'] == 'down':
        raise requests.ConnectionError('simulated: Google cannot be reached')
    if STATE['google'] == 'simulated':
        sim = STATE['simulated']
        token_properties = {
            'valid': bool(sim['valid']),
            'invalidReason': 'INVALID_REASON_UNSPECIFIED' if sim['valid'] else sim['invalid_reason'],
            # Empty = the action the endpoint expects, i.e. a correct token.
            'action': sim['action'] or action,
        }
        token_properties['androidPackageName' if platform == 'android' else 'iosBundleId'] = sim['app_id']
        return {
            'name': f'projects/local/assessments/simulated-{next(_counter)}',
            'tokenProperties': token_properties,
            'riskAnalysis': {'score': float(sim['score']), 'reasons': []},
        }
    return _real_create(token, platform, action)


def install():
    """Called from LocalTweaksConfig.ready()."""
    aa.create_mobile_assessment = _create
    logging.getLogger('core.security').addHandler(_Capture(level=logging.INFO))


def _snapshot():
    from core.checks import mobile_captcha_gaps
    path = settings.RECAPTCHA_ENTERPRISE_CREDENTIALS_PATH
    return {
        'mode': settings.RECAPTCHA_MOBILE_MODE,
        'mode_effective': aa.mobile_captcha_mode(),
        'google': STATE['google'],
        'simulated': STATE['simulated'],
        'config': {
            'project': settings.RECAPTCHA_ENTERPRISE_PROJECT_ID,
            'credentials_path': path,
            'credentials_found': bool(path) and os.path.isfile(path),
            'android_key': settings.RECAPTCHA_ANDROID_SITE_KEY,
            'ios_key': settings.RECAPTCHA_IOS_SITE_KEY,
            'app_id': settings.RECAPTCHA_MOBILE_APP_ID,
            'min_score': settings.RECAPTCHA_MOBILE_MIN_SCORE,
            'action_scores': settings.RECAPTCHA_MOBILE_ACTION_SCORES,
            'fail_open': settings.RECAPTCHA_MOBILE_FAIL_OPEN,
            'timeout': settings.RECAPTCHA_MOBILE_TIMEOUT,
            'web_captcha_secret_set': bool(settings.RECAPTCHA_SECRET_KEY),
            'captcha_required_for_otp': settings.CAPTCHA_REQUIRED_FOR_OTP,
        },
        'demo': {
            'enabled': settings.DEMO_ACCOUNT_ENABLED,
            'phone': settings.DEMO_ACCOUNT_PHONE,
            'otp': settings.DEMO_ACCOUNT_OTP,
        },
        'gaps': [f'{name} {why}' for name, why in mobile_captcha_gaps()],
        'log': list(LOG),
    }


@csrf_exempt
def state(request):
    """GET: everything the tab shows. POST: change mode / google / simulated values."""
    if request.method == 'POST':
        body = json.loads(request.body or '{}')
        if body.get('mode') in aa.MOBILE_MODES:
            settings.RECAPTCHA_MOBILE_MODE = body['mode']
        if body.get('google') in ('real', 'simulated', 'down'):
            STATE['google'] = body['google']
        if isinstance(body.get('simulated'), dict):
            STATE['simulated'].update({k: v for k, v in body['simulated'].items()
                                       if k in STATE['simulated']})
        if 'fail_open' in body:
            settings.RECAPTCHA_MOBILE_FAIL_OPEN = bool(body['fail_open'])
        if 'min_score' in body:
            settings.RECAPTCHA_MOBILE_MIN_SCORE = float(body['min_score'])
    return JsonResponse(_snapshot())


@csrf_exempt
def probe(request):
    """One assessment per platform with a dummy token against REAL Google,
    whatever the switch says - the same check as `manage.py captcha_status`."""
    results = []
    for platform in aa.MOBILE_PLATFORMS:
        try:
            result = _real_create('local-tester-probe', platform, aa.MOBILE_ACTION_SEND_OTP)
            results.append({'platform': platform, 'ok': True,
                            'answer': (result.get('tokenProperties') or {}).get('invalidReason')})
        except Exception as exc:  # noqa: BLE001 - shown on the tab
            results.append({'platform': platform, 'ok': False,
                            'answer': f'{type(exc).__name__}: {exc}'})
    return JsonResponse({'results': results})


@csrf_exempt
def clear_log(request):
    LOG.clear()
    return JsonResponse({'log': []})
