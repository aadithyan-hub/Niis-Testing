"""Create the test users and two sample articles in the LOCAL test DB. Safe to run again."""
from django.contrib.auth import get_user_model
from django.utils import timezone
from cms.models import Content

User = get_user_model()
for username, role in (('testadmin', 'admin'), ('testeditor', 'editor')):
    user, _ = User.objects.get_or_create(username=username, defaults={'role': role})
    user.role = role
    user.is_active = True
    user.set_password('Test@12345')
    user.save()
    print(f'user {username} / Test@12345 ({role})')

samples = [
    ('local-test-published', 'Hornbill Festival 2026 opens in Kisama', 'published',
     'Ten days of Naga culture, music and food at the Naga Heritage Village.'),
    ('local-test-in-review', 'Road repair work on NH-29 begins', 'pending_review',
     'Traffic will be diverted near Chumoukedima during the work.'),
]
for slug, title, status, summary in samples:
    Content.objects.update_or_create(slug=slug, defaults={
        'title': title, 'summary': summary, 'body': f'<p>{summary}</p>',
        'category': 'news', 'status': status,
        'published_at': timezone.now() if status == 'published' else None,
        # Leave empty, or put a PUBLIC image URL here: Facebook downloads it itself.
        'featured_image_url': '',
    })
    print(f'content {slug} ({status})')
