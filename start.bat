@echo off
cd /d "%~dp0"
if not exist data\srd.db py import_srd.py
py server.py --open
pause
