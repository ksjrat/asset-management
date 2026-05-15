@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   우리 자산 - 로컬 서버 시작
echo ========================================
echo.
echo  반드시 아래 주소로 접속하세요 (파일 더블클릭 X)
echo.
echo    http://localhost:8080
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo  [오류] Python이 설치되어 있지 않습니다.
  echo  https://www.python.org 에서 Python 3 설치 후 다시 실행하세요.
  pause
  exit /b 1
)

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "_ip=%%a"
  goto :shownet
)
:shownet
if defined _ip (
  echo  같은 Wi-Fi의 휴대폰에서 접속할 때:
  echo    http://%_ip: =%:8080
  echo.
)

echo  종료: 이 창에서 Ctrl+C
echo ========================================
echo.

python -m http.server 8080 --bind 127.0.0.1
pause
