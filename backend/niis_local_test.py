"""Local test backend for the NIIS Frontend Testing app.

Uses its OWN SQLite file (local_test.sqlite3 in this folder), never the
staging/production database in niis-api/.env.staging, and its own MinIO +
nginx from storage/ (run-storage.bat), never production storage.
"""
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Throwaway keys made for this tester only (keys/ is git-ignored).
KEYS = HERE / 'keys'

# Read local.env (Facebook App ID/Secret, MinIO etc.) before the NIIS settings read the environment.
import environ
environ.Env.read_env(HERE / 'local.env')
os.environ.setdefault('JWT_PRIVATE_KEY_PATH', str(KEYS / 'jwt_private.pem'))
os.environ.setdefault('JWT_PUBLIC_KEY_PATH', str(KEYS / 'jwt_public.pem'))
os.environ.setdefault('API_PAYLOAD_PRIVATE_KEY_PATH', str(KEYS / 'payload_private.pem'))
os.environ.setdefault('API_PAYLOAD_PUBLIC_KEY_PATH', str(KEYS / 'payload_public.pem'))
# Mobile reCAPTCHA tab: the app-store demo phone (to check it skips the app
# check) and OTP limits raised for testing; production keeps 3/min and 10/hour.
for _name, _value in [
    ('DEMO_ACCOUNT_ENABLED', 'True'), ('DEMO_ACCOUNT_PHONE', '9999999999'),
    ('DEMO_ACCOUNT_OTP', '999999'),
    ('THROTTLE_OTP', '100/min'), ('THROTTLE_OTP_IDENTIFIER_HOURLY', '1000/hour'),
    ('THROTTLE_OTP_IP', '100/min'), ('THROTTLE_OTP_IP_HOURLY', '1000/hour'),
    ('THROTTLE_OTP_VERIFY_IP', '1000/hour'),
]:
    os.environ.setdefault(_name, _value)

from config.settings.test import *  # noqa: F401,F403,E402

DEBUG = True
ALLOWED_HOSTS = ['127.0.0.1', 'localhost']
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3',
                         'NAME': str(HERE / 'local_test.sqlite3')}}
CORS_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
# Posts made "now" are sent inside the request; scheduled ones by run-due-posts.bat.
# Media library: an approved field report's media is imported inside the request too.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = False
INSTALLED_APPS = INSTALLED_APPS + ['local_tweaks']

# ---- Mobile reCAPTCHA tab ----
# The NIIS URLs plus /local/recaptcha/ (local_urls.py) for the tab's switches.
ROOT_URLCONF = 'local_urls'
# config.settings.test switches the mobile check off for the unit tests; read it
# back from local.env here. Values live in local.env only (git-ignored).
_env = environ.Env()
RECAPTCHA_MOBILE_MODE = _env('RECAPTCHA_MOBILE_MODE', default='monitor')
RECAPTCHA_ENTERPRISE_PROJECT_ID = _env('RECAPTCHA_ENTERPRISE_PROJECT_ID', default='')
RECAPTCHA_ENTERPRISE_CREDENTIALS_PATH = _env(
    'RECAPTCHA_ENTERPRISE_CREDENTIALS_PATH', default=str(KEYS / 'recaptcha-service-account.json'))
RECAPTCHA_ANDROID_SITE_KEY = _env('RECAPTCHA_ANDROID_SITE_KEY', default='')
RECAPTCHA_IOS_SITE_KEY = _env('RECAPTCHA_IOS_SITE_KEY', default='')
# A browser only sends the app's headers if CORS allows them (the real apps are
# not browsers, so production needs no such entry).
CORS_ALLOW_HEADERS = list(CORS_ALLOW_HEADERS) + ['x-platform', 'x-recaptcha-token']
# send-otp returns the code, so the tab can run verify-otp without a phone.
DEV_EXPOSE_OTP = True
