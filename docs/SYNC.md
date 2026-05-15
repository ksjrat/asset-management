# PC · 폰 · 배우자 데이터 연동 (Firebase)

같은 **가족 코드**를 쓰는 기기끼리 자산·예산·목표 데이터가 클라우드에 맞춰집니다.

## 1. Firebase 프로젝트 만들기 (최초 1회)

1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 추가
2. **Firestore Database** 생성 (테스트 모드로 시작 가능)
3. 프로젝트 설정 → 일반 → **웹 앱 추가** → `firebaseConfig` 값 복사

## 2. 앱에 설정 넣기

```bash
copy js\sync-config.example.js js\sync-config.js
```

`js/sync-config.js` 를 열고:

- `SYNC_ENABLED = true`
- `firebaseConfig` 에 복사한 값 붙여넣기

## 3. Firestore 보안 규칙 (예시)

Firebase Console → Firestore → 규칙:

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

> 가족 코드를 아는 사람이 읽고 쓸 수 있습니다. 코드를 가족에게만 공유하세요.  
> 나중에 Firebase Authentication 을 붙이면 규칙을 강화할 수 있습니다.

## 4. 사용 방법

1. GitHub Pages 등 **https** 로 배포된 주소에서 앱 실행
2. 회원가입 → **배우자 연결**에서 **코드 발급**
3. 다른 기기(폰·PC)에서 같은 주소 접속 → 로그인 → **같은 가족 코드 입력**
4. 설정 → **동기화**에서 상태가 「클라우드 연동 중」인지 확인

저장할 때마다 자동 업로드되며, 다른 기기는 실시간에 가깝게 반영됩니다.

## 동기화되는 항목

- 자산·부채, 목표, 예산, 거래, 실적
- 배우자 연결 상태, 가족 코드

## 기기마다 따로 두는 항목

- 로그인 이름·이메일(로컬)
- 생체 인증·앱 잠금 설정

## 문제 해결

| 증상 | 확인 |
|------|------|
| 로컬만 표시 | `sync-config.js` 에 `SYNC_ENABLED: true` 인지 |
| 동기화 안 됨 | https 로 열었는지, 가족 코드가 같은지 |
| 빈 데이터 | 코드 발급한 쪽에서 먼저 데이터 입력 후 다른 기기에서 「지금 동기화」 |
