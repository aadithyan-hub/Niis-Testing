@echo off
rem Local test backend: its own SQLite DB in this folder, NOT the staging/production DB.
rem Also starts the local storage (MinIO + nginx) and seeds the media library users.
rem niis-api is expected next to this tester folder; set NIIS_API to use another place.
if not defined NIIS_API set "NIIS_API=%~dp0..\..\niis-api"
if not exist "%NIIS_API%\venv\Scripts\python.exe" (
  echo niis-api with its venv not found at %NIIS_API%
  echo Clone niis-api next to this folder and make its venv, or set NIIS_API to its folder.
  pause
  exit /b 1
)
set PYTHONPATH=%~dp0
set PYTHONIOENCODING=utf-8
set DJANGO_SETTINGS_MODULE=niis_local_test
call "%~dp0run-storage.bat" || exit /b 1
cd /d "%NIIS_API%"
if not exist "%~dp0local.env" copy "%~dp0local.env.example" "%~dp0local.env"
venv\Scripts\python.exe "%~dp0make_keys.py" || (pause & exit /b 1)
venv\Scripts\python.exe manage.py migrate --noinput
venv\Scripts\python.exe manage.py shell -c "exec(open(r'%~dp0seed.py', encoding='utf-8').read())"
venv\Scripts\python.exe manage.py shell -c "exec(open(r'%~dp0seed_media.py', encoding='utf-8').read())"
venv\Scripts\python.exe manage.py shell -c "exec(open(r'%~dp0seed_instagram.py', encoding='utf-8').read())"
pause
