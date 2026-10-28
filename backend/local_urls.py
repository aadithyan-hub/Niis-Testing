"""Local testing only: the NIIS URLs plus the controls of the Mobile reCAPTCHA
tab (local_tweaks/recaptcha.py) and the simulated Instagram
(local_tweaks/instagram.py). niis-api itself has none of the /local/ paths."""
from django.urls import include, path

from local_tweaks import instagram, recaptcha

urlpatterns = [
    path('local/recaptcha/state/', recaptcha.state),
    path('local/recaptcha/probe/', recaptcha.probe),
    path('local/recaptcha/log/clear/', recaptcha.clear_log),
    path('local/instagram/state/', instagram.state_view),
    path('local/instagram/run-due/', instagram.run_due_view),
    path('', include('config.urls')),
]
