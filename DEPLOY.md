# ☁ 외부망 배포 가이드 — PythonAnywhere (무료)

집/사무실 PC를 켜두지 않아도 **인터넷 어디서나** 접속할 수 있게 만드는 방법입니다.
PythonAnywhere 무료 요금제는 **항상 켜져 있고(안 꺼짐)**, 데이터 파일(`farm_data.db`)도
**영구 보존**되어 이 앱에 잘 맞습니다. 완성되면 주소는 `https://아이디.pythonanywhere.com` 입니다.

> ⏱ 처음이라면 약 15~20분. 컴퓨터(터미널)에 익숙하지 않아도 따라 할 수 있게 적었습니다.
> 막히면 어느 단계인지 알려주세요 — 그 부분을 같이 풀어 드리겠습니다.

---

## 0. 미리 정해둘 2가지

배포 전에 아래 두 값을 정해 메모해 두세요(4단계에서 사용).

| 항목 | 설명 | 예시 |
|------|------|------|
| **APP_PASSWORD** | 접속 비밀번호. 이걸 아는 사람만 들어올 수 있습니다. | `uri-nongjang-2026` |
| **SECRET_KEY** | 로그인 세션 보호용 임의 문자열(아무 긴 문자열). | 아래 명령으로 생성 |

SECRET_KEY는 내 PC 터미널에서 아래를 실행해 나온 값을 쓰면 됩니다(아무 길고 무작위면 OK):

```bash
python3 -c "import secrets; print(secrets.token_hex(24))"
```

---

## 1. 회원가입

1. https://www.pythonanywhere.com 접속 → **Pricing & signup** → **Create a Beginner account**(무료).
2. 가입한 **아이디(username)** 를 기억하세요. 사이트 주소가 `아이디.pythonanywhere.com` 이 됩니다.

---

## 2. 코드 올리기 (둘 중 편한 방법)

### 방법 A — 압축파일 업로드 (가장 쉬움)
1. 내 PC에서 `farm_solar_manager` 폴더를 압축합니다.
   (macOS: 폴더 우클릭 → "압축"; Windows: 우클릭 → "보내기 → 압축 폴더")
   - `farm_data.db`(내 데이터)는 굳이 올리지 않아도 됩니다. 서버에서 자동 생성됩니다.
2. PythonAnywhere 상단 **Files** 탭 → 우측 **Upload a file** 로 방금 만든 zip 업로드.
3. 상단 **Consoles** 탭 → **Bash** 콘솔 열고 아래 입력(zip 이름은 실제 파일명으로):
   ```bash
   unzip farm_solar_manager.zip
   ls farm_solar_manager     # web_app.py 등이 보이면 성공
   ```

### 방법 B — GitHub 연동 (깃을 쓰신다면)
```bash
git clone https://github.com/<본인깃허브>/farm_solar_manager.git
```

> 이후 코드를 고쳐 재배포할 때 방법 B(`git pull`)가 편합니다. 처음엔 방법 A로 충분합니다.

---

## 3. 필요한 라이브러리 설치

**Bash** 콘솔에서(파이썬 버전은 무료 요금제 기준 3.10 예시):

```bash
pip3.10 install --user Flask
```

> PythonAnywhere는 자체 웹 서버를 쓰므로 **gunicorn은 설치하지 않아도 됩니다.**
> (저장소의 `Procfile`·`gunicorn`은 Render/Fly용이라 여기선 사용하지 않습니다.)

---

## 4. 웹 앱 등록 + 환경설정

1. 상단 **Web** 탭 → **Add a new web app** → **Next** →
   **Manual configuration**(주의: "Flask"가 아니라 **Manual**) 선택 →
   **Python 3.10** 선택 → 생성.

2. 같은 **Web** 탭에서 아래 두 칸을 채웁니다(아이디는 본인 것으로):
   - **Source code**:  `/home/아이디/farm_solar_manager`
   - **Working directory**:  `/home/아이디/farm_solar_manager`

3. **WSGI configuration file** 링크(예: `/var/www/아이디_pythonanywhere_com_wsgi.py`)를 클릭해
   내용을 **전부 지우고** 아래로 교체합니다.
   `아이디`, `여기에_비밀번호`, `여기에_시크릿키`(0단계 값)를 본인 값으로 바꾸세요:

   ```python
   import sys, os

   # 1) 코드 위치를 파이썬 경로에 추가
   project = '/home/아이디/farm_solar_manager'
   if project not in sys.path:
       sys.path.insert(0, project)

   # 2) 환경설정 (★ 본인 값으로 변경)
   os.environ['APP_PASSWORD'] = '여기에_비밀번호'      # 접속 비밀번호
   os.environ['SECRET_KEY']   = '여기에_시크릿키'      # 0단계에서 생성한 값
   # 데이터를 코드 폴더 '밖'에 두면 재배포해도 데이터가 안전합니다
   os.environ['DATA_DIR']     = '/home/아이디/farm_data'

   # 3) 앱 불러오기 (이 줄은 그대로)
   from web_app import app as application
   ```

   저장(**Save**)합니다.

4. **Web** 탭 맨 위의 초록색 **Reload** 버튼을 누릅니다.

---

## 5. 접속 확인

- 브라우저에서 **`https://아이디.pythonanywhere.com`** 접속 →
  비밀번호 입력 화면이 뜨면 성공입니다(4단계 APP_PASSWORD 입력).
- **휴대폰**: 같은 주소로 접속 → 브라우저 메뉴에서 **홈 화면에 추가**(PWA).
  - PythonAnywhere는 기본 **HTTPS**라 휴대폰 앱 설치(서비스워커)가 정상 동작합니다.
- 와이파이가 아니어도, PC를 꺼도, **어디서나** 접속됩니다.

---

## 자주 묻는 점 / 주의

- **데이터 백업**: `Files` 탭에서 `/home/아이디/farm_data/farm_data.db` 를 가끔 내려받아 두세요.
  (앱 메뉴의 *CSV 내보내기(ZIP)* 로도 백업 가능)
- **비밀번호 변경**: 4단계 WSGI 파일의 `APP_PASSWORD` 값을 바꾸고 **Reload**.
- **무료 요금제 유지**: 3개월마다 PythonAnywhere가 보내는 메일에서 버튼 한 번
  ("Run until 3 months from today")으로 계속 무료 유지됩니다.
- **코드 수정 후 반영**: 파일을 새로 올리거나 `git pull` 한 뒤 **Reload** 버튼.
- **여러 명이 동시에 많이 쓰는 용도**는 아닙니다(개인/가족용 단일 SQLite). 그 이상이 필요하면 알려주세요.

---

## 다른 플랫폼을 원하시면

- **Render**(GitHub 자동배포, 데이터 영구보존은 월 $7) / **Fly.io**(무료 영구디스크, CLI 필요)
  방식도 안내할 수 있습니다. 저장소에 이미 `Procfile`·`requirements.txt`(gunicorn 포함)·
  `.python-version` 이 들어 있어 그대로 쓸 수 있습니다. 원하시면 해당 가이드를 만들어 드릴게요.
