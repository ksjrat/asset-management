# PC · 폰 · 배우자 연동

앱 안 **설정 → 연동 도우미** 한 곳에서 진행합니다.

## 사용자 (가족) — 3단계

1. **같은 주소**로 접속  
   예: `https://<사용자>.github.io/<저장소>/` (PC·폰 북마크 동일)
2. **연동 도우미**  
   - 데이터 있는 쪽: **코드 발급** → 카톡 등으로 코드·주소 공유  
   - 다른 기기·배우자: **코드 입력**
3. **가족 암호** (6자 이상, 모든 기기 동일) → **지금 맞추기**

데이터가 있는 기기에서 먼저 입력한 뒤, 다른 기기에서 도우미 마지막 단계(동기화)를 실행하세요.

---

## 저장소 관리자 — Firebase (최초 1회)

GitHub Pages만 쓰면 배포본에 Firebase가 없어 **클라우드가 꺼진 상태**입니다. 아래를 하면 배포할 때마다 자동으로 켜집니다.

### 1. Firebase 프로젝트

1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 추가  
2. **Firestore Database** 생성  
3. 프로젝트 설정 → 일반 → **웹 앱 추가** → `firebaseConfig` JSON 전체 복사  

Firestore 규칙 (가족 코드 아는 사람 읽기/쓰기 — 나중에 Auth로 강화 가능):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{householdId} {
      allow read, write: if true;
    }
  }
}
```

### 2. GitHub 시크릿 (Pages 배포)

1. 저장소 **Settings → Secrets and variables → Actions**  
2. **New repository secret**  
   - 이름: `FIREBASE_CONFIG`  
   - 값: Firebase에서 복사한 **객체 전체** (한 줄 JSON 가능)

```json
{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "..."
}
```

3. `main`에 push → Actions가 `js/sync-config.js`를 만들어 Pages에 포함  

로컬 개발만 할 때는 예전처럼:

```bash
cp js/sync-config.example.js js/sync-config.js
```

`SYNC_ENABLED = true` 와 `firebaseConfig` 를 채웁니다.

### 3. 가족 암호

클라우드 데이터는 **암호화 후** 업로드됩니다. 자세한 내용은 [SECURITY.md](./SECURITY.md).

---

## 문제 해결

| 증상 | 확인 |
|------|------|
| 설정에 클라우드 미설정 | `FIREBASE_CONFIG` 시크릿 후 재배포 |
| 연동 도우미만 되고 데이터 안 맞음 | 같은 주소·같은 코드·같은 가족 암호 |
| 빈 화면 | 데이터 있는 기기에서 먼저 쓰기 → 다른 기기에서 **지금 동기화** |
| 암호 오류 | 모든 기기에서 가족 암호 재입력 (연동 도우미 2단계) |

---

## 동기화 항목

- 자산·부채(🔒 비공개 제외), 목표, 예산, 거래, 실적  
- 배우자 연결, 가족 코드  

## 기기마다 따로

- 로그인 이름·이메일, 🔒 비공개 자산, 생체·앱 잠금·가족 암호(서버 미저장)
