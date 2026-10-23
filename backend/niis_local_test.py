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
