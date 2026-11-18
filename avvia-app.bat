@echo off
rem Apre Movement Coach sul PC: un piccolo server locale (doppio clic su index.html non funziona,
rem il browser blocca il codice dell'app). Chiudi questa finestra per fermarlo.
cd /d "%~dp0"
set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
start "" http://localhost:8000/
"%PY%" -m http.server 8000
