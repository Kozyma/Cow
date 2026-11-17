# 한우의 기준 — 쇼핑몰 + 백오피스 (농장 관리 앱과 별도 컨테이너)
FROM python:3.12-slim
WORKDIR /shop
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# 주문 DB(shop_data.db)와 상품 사진(uploads/)은 /shop/data 에 저장 → 볼륨으로 영속화
ENV DATA_DIR=/shop/data PORT=8100
EXPOSE 8100
CMD ["gunicorn", "shop_app:app", "--bind", "0.0.0.0:8100", "--workers", "1", "--threads", "4", "--timeout", "120"]
