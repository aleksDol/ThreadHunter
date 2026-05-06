FROM python:3.11-slim
WORKDIR /app

COPY apps/telegram-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/telegram-worker ./apps/telegram-worker

WORKDIR /app/apps/telegram-worker
CMD ["python", "src/main.py"]
