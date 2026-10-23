@echo off
rem Local MinIO + nginx for the media library tester (Docker Desktop must be running).
rem   MinIO API 127.0.0.1:9100, console 127.0.0.1:9101 (niislocal / niislocal-secret)
rem   nginx     127.0.0.1:8090 - plays the part of https://niis.falconavl.com for files
cd /d "%~dp0storage"
docker compose up -d
if errorlevel 1 (
  echo Could not start the containers. Is Docker Desktop running?
  pause
  exit /b 1
)
echo Storage is up.
