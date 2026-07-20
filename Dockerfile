FROM python:3.12-slim

WORKDIR /app

# 의존성 먼저 설치 (레이어 캐시 활용)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 소스 복사
COPY . .

# SQLite 데이터는 /app/data 에 저장 (compose에서 볼륨 마운트로 영속화)
ENV DATA_DIR=/app/data \
    PORT=8000

EXPOSE 8000

CMD ["gunicorn", "web_app:app", "--bind", "0.0.0.0:8000", "--workers", "1", "--timeout", "120"]
