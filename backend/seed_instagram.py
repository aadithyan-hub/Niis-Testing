"""Articles for testing Instagram posting, in the LOCAL test DB and LOCAL
storage (run-storage.bat must be running). Safe to run again.

Each article's featured image tests one case of the Instagram-ready copy:
too tall, too wide, transparent, carrying GPS data, animated, none at all, or
from outside NIIS storage. Run from setup.bat, or on its own with
run-backend.bat's environment:

    manage.py shell -c "exec(open(r'...\\seed_instagram.py', encoding='utf-8').read())"
"""
import io

from django.conf import settings
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont

from cms.models import Content
from core.storage import put_object_bytes


def _picture(size, label, mode='RGB', background=(26, 86, 160)):
    img = Image.new(mode, size, background if mode == 'RGB' else (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    width, height = size
    if mode == 'RGBA':
        draw.ellipse((width * 0.1, height * 0.1, width * 0.9, height * 0.9),
                     fill=(220, 120, 20, 255))
    draw.rectangle((4, 4, width - 5, height - 5), outline=(255, 210, 0), width=6)
    font = ImageFont.load_default(size=max(18, min(width, height) // 12))
    draw.multiline_text((width / 2, height / 2), f'{label}\n{width} x {height}',
                        fill=(255, 255, 255), font=font, anchor='mm', align='center')
    return img


def _store(key, img, fmt, **save):
    out = io.BytesIO()
    img.save(out, fmt, **save)
    content_type = {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'GIF': 'image/gif'}[fmt]
    put_object_bytes('media', key, out.getvalue(), content_type)
    base = settings.MINIO_PUBLIC_URL.rstrip('/')
    return f'{base}/{settings.MINIO_BUCKETS["media"]}/{key}'


def _gps_photo():
    img = _picture((1200, 1200), 'Photo with GPS', background=(40, 120, 60))
    exif = img.getexif()
    exif[0x010F] = 'Phone maker'                  # Make
    exif[0x8825] = {1: 'N', 2: (25.0, 40.0, 0.0), 3: 'E', 4: (94.0, 6.0, 0.0)}  # GPS: Kohima
    return img, exif


def _animated_gif():
    frames = [_picture((600, 600), f'GIF frame {n}', background=(120 + 40 * n, 40, 90))
              for n in range(3)]
    return frames


gps_img, gps_exif = _gps_photo()
gif_frames = _animated_gif()
images = {
    'tall': _store('cms/instagram-test/tall-poster.png',
                   _picture((1080, 2400), 'Tall poster (9:20)'), 'PNG'),
    'wide': _store('cms/instagram-test/wide-banner.jpg',
                   _picture((3000, 900), 'Wide banner (10:3)'), 'JPEG', quality=90),
    'transparent': _store('cms/instagram-test/transparent.png',
                          _picture((800, 800), 'Transparent PNG', mode='RGBA'), 'PNG'),
    'gps': _store('cms/instagram-test/photo-with-gps.jpg', gps_img, 'JPEG',
                  quality=90, exif=gps_exif),
    'gif': _store('cms/instagram-test/animated.gif', gif_frames[0], 'GIF', save_all=True,
                  append_images=gif_frames[1:], duration=400, loop=0),
}

LONG_SUMMARY = ' '.join(
    f'Paragraph {n}: the Directorate of Information and Public Relations announces the '
    f'schedule of the district information camps, with services, timings and venues.'
    for n in range(1, 31))

samples = [
    ('ig-test-tall-poster', 'IG test: tall poster (padded left and right)', 'published',
     'A 1080 x 2400 poster. Instagram copy: white bars at the sides, nothing cut.',
     images['tall']),
    ('ig-test-wide-banner', 'IG test: wide banner (padded top and bottom)', 'published',
     'A 3000 x 900 banner. Instagram copy: 1440 wide, white bars above and below.',
     images['wide']),
    ('ig-test-transparent-png', 'IG test: transparent PNG (white background)', 'published',
     'Transparency becomes white in the JPEG.', images['transparent']),
    ('ig-test-gps-photo', 'IG test: photo with GPS (location removed)', 'published',
     'The source has GPS and camera EXIF; the Instagram copy must have none.',
     images['gps']),
    ('ig-test-animated-gif', 'IG test: animated GIF (first frame)', 'published',
     'Instagram takes a still JPEG: the first frame is used.', images['gif']),
    ('ig-test-long-caption', 'IG test: long caption (cut to 2,200, link kept)', 'published',
     LONG_SUMMARY, images['wide']),
    ('ig-test-in-review', 'IG test: in review (posts after approval)', 'pending_review',
     'Queue an Instagram post now; it goes out when the editor approves.', images['tall']),
    ('ig-test-no-image', 'IG test: no image (Instagram refuses, Facebook allows)', 'published',
     'No featured image.', ''),
    ('ig-test-outside-image', 'IG test: image outside NIIS (Instagram refuses)', 'published',
     'The featured image is on another site.', 'https://example.com/photo.jpg'),
]
for slug, title, status, summary, image in samples:
    Content.objects.update_or_create(slug=slug, defaults={
        'title': title, 'summary': summary, 'body': f'<p>{summary}</p>',
        'category': 'news', 'status': status, 'featured_image_url': image,
        'published_at': timezone.now() if status == 'published' else None,
    })
    print(f'content {slug} ({status}) image: {image or "-"}')
