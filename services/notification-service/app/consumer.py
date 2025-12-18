from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import aio_pika

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
EVENTS_EXCHANGE = os.getenv("EVENTS_EXCHANGE", "cruise.events")
QUEUE_NAME = os.getenv("QUEUE_NAME", "notification-service.events")


def _now():
    return datetime.now(tz=timezone.utc)


class NotificationStore:
    def __init__(self):
        self._items: list[dict] = []

    def add(self, item: dict) -> None:
        self._items.append(item)
        self._items = self._items[-500:]

    def list(self, customer_id: str | None = None) -> list[dict]:
        if customer_id is None:
            return list(reversed(self._items))
        return [n for n in reversed(self._items) if n.get("customer_id") == customer_id]


store = NotificationStore()


async def start_consumer() -> None:
    conn = await aio_pika.connect_robust(RABBITMQ_URL)
    channel = await conn.channel()
    exchange = await channel.declare_exchange(EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)

    queue = await channel.declare_queue(QUEUE_NAME, durable=True)
    await queue.bind(exchange, routing_key="booking.*")

    async with queue.iterator() as iterator:
        async for message in iterator:
            async with message.process(ignore_processed=True):
                try:
                    event = json.loads(message.body.decode("utf-8"))
                    etype = event.get("type")
                    data = event.get("data") or {}

                    if etype == "booking.confirmed":
                        store.add(
                            {
                                "time": _now().isoformat(),
                                "customer_id": data.get("customer_id"),
                                "kind": "booking_confirmed",
                                "message": f"Booking {data.get('booking_id')} confirmed.",
                                "data": data,
                            }
                        )
                    elif etype == "booking.held":
                        store.add(
                            {
                                "time": _now().isoformat(),
                                "customer_id": data.get("customer_id"),
                                "kind": "booking_held",
                                "message": f"Booking {data.get('booking_id')} held until {data.get('hold_expires_at')}",
                                "data": data,
                            }
                        )
                except Exception:
                    continue
