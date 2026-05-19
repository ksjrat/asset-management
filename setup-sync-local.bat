@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "TARGET=js\sync-config.js"
set "EXAMPLE=js\sync-config.example.js"

if not exist "%EXAMPLE%" (
  echo [오류] %EXAMPLE% 파일이 없습니다.
  pause
  exit /b 1
)

if exist "%TARGET%" (
  echo.
  echo  %TARGET% 가 이미 있습니다. 덮어쓰지 않습니다.
  echo  Firebase 값만 수정하면 됩니다.
) else (
  copy /Y "%EXAMPLE%" "%TARGET%" >nul
  echo.
  echo  %EXAMPLE% ^> %TARGET% 복사 완료
)

echo.
echo  다음 단계:
echo  1. %TARGET% 를 열어 firebaseConfig 값을 Firebase 콘솔에서 복사한 값으로 채우기
echo  2. SYNC_ENABLED = true 인지 확인
echo  3. start-server.bat 다시 실행 후 http://localhost:8080 접속
echo  4. 설정 - 연동 도우미에서 클라우드가 "연결됨"인지 확인
echo.
echo  배포 사이트와 맞추려면 GitHub 시크릿 FIREBASE_CONFIG 와 같은 프로젝트를 쓰세요.
echo  docs\SYNC.md 참고
echo.
pause
