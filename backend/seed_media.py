"""Users, buckets and workflows for the media library tester, in the LOCAL
test DB and LOCAL MinIO only. Safe to run again.

Every user's password is Test@12345, except `admin` (admin@123).
"""
import json

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command

from core.storage import get_minio_client

assert 'sqlite' in settings.DATABASES['default']['ENGINE'], 'Refusing: not the local SQLite DB'
assert settings.MINIO_ENDPOINT.startswith(('127.0.0.1', 'localhost')), 'Refusing: not local MinIO'

User = get_user_model()

#  username       role            districts       department                 name
USERS = [
    ('admin',        'admin',         [],             '',                        'Local Admin'),
    ('editor1',      'editor',        [],             '',                        'Esther Editor'),
    ('dpro_kohima',  'dpro',          ['Kohima'],     '',                        'Kevi DPRO Kohima'),
    ('apro_kohima',  'apro',          ['Kohima'],     '',                        'Asen APRO Kohima'),
    ('dpro_dimapur', 'dpro',          ['Dimapur'],    '',                        'Dino DPRO Dimapur'),
    ('fo_kohima',    'field_officer', ['Kohima'],     'Agriculture',             'Faith FO Kohima'),
    ('fo_kohima2',   'field_officer', ['Kohima'],     'Health & Family Welfare', 'Felix FO Kohima'),
    ('ia_dimapur',   'ia',            ['Dimapur'],    'Agriculture',             'Imna IA Dimapur'),
    ('fo_none',      'field_officer', [],             'Health and Family Welfare', 'Fern FO no district'),
    ('analyst',      'media_analyst', [],             '',                        'Mona Media Analyst'),
    ('citizen1',     'citizen',       [],             '',                        'Chuba Citizen'),
]

for username, role, districts, department, name in USERS:
    first, _, last = name.partition(' ')
    user, _ = User.objects.get_or_create(username=username, defaults={'role': role})
    user.role = role
    user.assigned_districts = districts
    user.department = department
    user.first_name, user.last_name = first, last
    user.is_active = True
    user.is_staff = username == 'admin'
    user.set_password('admin@123' if username == 'admin' else 'Test@12345')
    user.save()
    print(f'user {username:13} {role:14} {",".join(districts) or "-":8} {department or "-"}')

# Buckets: like production - media and documents public-read, the rest private.
call_command('setup_minio')
client = get_minio_client()
for bucket_type in ('media', 'documents'):
    bucket = settings.MINIO_BUCKETS[bucket_type]
    client.set_bucket_policy(bucket, json.dumps({
        'Version': '2012-10-17',
        'Statement': [{'Effect': 'Allow', 'Principal': {'AWS': ['*']},
                       'Action': ['s3:GetObject'], 'Resource': [f'arn:aws:s3:::{bucket}/*']}],
    }))
    print(f'bucket {bucket}: public read')
print(f'bucket {settings.MINIO_BUCKETS["library"]}: private')

# The field-report approval workflow (DPRO, then editor) used by FR-012.
call_command('seed_workflows')
