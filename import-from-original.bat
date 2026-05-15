@echo off
cd /d "%~dp0"
echo [가계부] original data 폴더의 xlsx를 JSON으로 변환합니다...
python scripts\import_from_xlsx.py
if errorlevel 1 pause
echo.
echo 완료: import\ledger-imported.json
echo 앱에서 설정 - JSON 가져오기 또는 import.html 사용
pause
