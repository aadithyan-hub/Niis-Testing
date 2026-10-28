import socket

from django.apps import AppConfig

_original_getaddrinfo = socket.getaddrinfo


def _facebook_over_ipv6(host, port, family=0, type=0, proto=0, flags=0):
    """This office network resets Facebook connections over IPv4 but lets
    IPv6 through, and `requests` tries IPv4 first. Local testing only.
    (Asked for "any" family, Windows answers with IPv4 only, so ask for IPv6.)"""
    if isinstance(host, str) and host.endswith('facebook.com'):
        try:
            return _original_getaddrinfo(host, port, socket.AF_INET6, type, proto, flags)
        except socket.gaierror:
            pass
    return _original_getaddrinfo(host, port, family, type, proto, flags)


class LocalTweaksConfig(AppConfig):
    """Local testing only:
    - no Elasticsearch here, so skip search reindexing (otherwise every
      content save waits ~15 s on connection retries);
    - reach graph.facebook.com over IPv6 (see above);
    - Mobile reCAPTCHA tab: switchable Google (real / simulated / down) and
      a copy of the CAPTCHA log lines (see recaptcha.py);
    - Social posting tab: a simulated Instagram for SIM tokens, and a guard
      that never lets a real Instagram post leave this computer (see
      instagram.py)."""
    name = 'local_tweaks'

    def ready(self):
        from cms.tasks import index_content_to_es
        index_content_to_es.delay = lambda *args, **kwargs: None
        socket.getaddrinfo = _facebook_over_ipv6
        from local_tweaks import instagram, recaptcha
        recaptcha.install()
        instagram.install()
