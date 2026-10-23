"""Stands in for Celery beat locally: every 30 s sends due / scheduled posts,
every 5 min refreshes likes, comments and shares. Stop with Ctrl+C."""
import time
from social.services.publishing import publish_due, refresh_metrics

tick = 0
while True:
    print(time.strftime('%H:%M:%S'), 'publish_due', publish_due())
    if tick % 10 == 0:
        print(time.strftime('%H:%M:%S'), 'refresh_metrics', refresh_metrics())
    tick += 1
    time.sleep(30)
