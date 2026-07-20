# 🚀 EC2 배포 가이드 (GitHub Actions + Docker)

`main` 브랜치에 push하면 GitHub Actions가 EC2에 SSH로 접속해 자동 배포합니다.
(SSH → 코드 갱신 → `.env` 생성 → `docker compose up -d --build`)

## 아키텍처
- **EC2**: t4g.nano (Amazon Linux 2023 ARM64), Docker + docker compose 설치됨
- **실행**: `docker compose`로 `gunicorn web_app:app` 컨테이너 구동, 호스트 `80` → 컨테이너 `8000`
- **DB**: SQLite(`farm_data.db`)를 named volume `cow-data`(`/app/data`)에 저장 → 재배포에도 유지
- **도메인**: `koreacow.kr` → EC2 고정 IP(EIP)

## 필수: GitHub Secrets 등록
레포 **Settings → Secrets and variables → Actions → New repository secret** 에서 아래 4개 등록:

| Secret 이름 | 값 | 비고 |
|---|---|---|
| `EC2_HOST` | EC2 공인 IP (EIP) | 예: `3.35.40.35` |
| `EC2_SSH_KEY` | SSH 개인키(.pem) **전체 내용** | `-----BEGIN ...` 부터 끝까지 |
| `SECRET_KEY` | Flask 세션 서명 키 | `python3 -c "import secrets; print(secrets.token_hex(24))"` |
| `APP_PASSWORD` | 앱 접속 비밀번호 | 이 값을 아는 사람만 로그인 가능 |

## 배포 실행
- `main`에 push → 자동 배포
- 또는 **Actions 탭 → Deploy to EC2 → Run workflow** (수동 실행)

## 확인
- 브라우저에서 `http://koreacow.kr` 접속
- 서버에서 상태 확인: `docker compose ps`, 로그: `docker compose logs -f`

## 참고
- t4g.nano는 RAM 0.5GB라 Docker 빌드 중 메모리가 빠듯할 수 있습니다.
  빌드 실패(OOM) 시 EC2에 swap 2GB를 추가하세요:
  ```bash
  sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- HTTPS가 필요하면 Nginx + Let's Encrypt(certbot) 또는 Caddy를 추가로 구성하세요.
