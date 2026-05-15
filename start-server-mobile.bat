@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 휴대폰 접속용 - 방화벽에서 Python 허용이 필요할 수 있습니다.
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo  http://%%a:8080
echo.
python -m http.server 8080 --bind 0.0.0.0
pause
