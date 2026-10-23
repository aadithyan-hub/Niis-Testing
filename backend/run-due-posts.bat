@echo off
rem Local test backend: its own SQLite DB in this folder, NOT the staging/production DB.
rem niis-api is expected next to this tester folder; set NIIS_API to use another place.
if not defined NIIS_API set "NIIS_API=%~dp0..\..\niis-api"
set PYTHONPATH=%~dp0
set DJANGO_SETTINGS_MODULE=niis_local_test
cd /d "%NIIS_API%" || (pause & exit /b 1)
venv\Scripts\python.exe manage.py shell -c "exec(open(r'%~dp0due_loop.py', encoding='utf-8').read())"
