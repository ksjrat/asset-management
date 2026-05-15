@echo off
echo 승재·은지 가계부 — 로컬 서버 시작
echo 브라우저에서 http://localhost:8080 열기
echo 종료: Ctrl+C
python -m http.server 8080
if errorlevel 1 py -m http.server 8080
