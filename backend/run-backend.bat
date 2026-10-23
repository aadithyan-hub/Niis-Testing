@echo off
rem Local test backend: its own SQLite DB in this folder, NOT the staging/production DB.
rem niis-api is expected next to this tester folder; set NIIS_API to use another place.
if not defined NIIS_API set "NIIS_API=%~dp0..\..\niis-api"
set PYTHONPATH=%~dp0
set PYTHONIOENCODING=utf-8
set DJANGO_SETTINGS_MODULE=niis_local_test
cd /d "%NIIS_API%" || (pause & exit /b 1)
echo Local test backend: http://127.0.0.1:8001   Swagger: http://127.0.0.1:8001/api/docs/
venv\Scripts\python.exe manage.py runserver 127.0.0.1:8001
