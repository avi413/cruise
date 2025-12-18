from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import aio_pika

from .db import session
from .models import BookingHistory

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
EVENTS_EXCHANGE = os.getenv("EVENTS_EXCHANGE", "cruise.events")

QUEUE_NAME = os.getenv("QUEUE_NAME", "customer-service.events")


def _now():
    return datetime.now(tz=timezone.utc)


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
                    if etype not in {"booking.held", "booking.confirmed"}:
                        continue

                    booking_id = data.get("booking_id")
                    if not booking_id:
                        continue

                    with session() as s:
                        row = s.get(BookingHistory, booking_id)
                        if row is None:
                            row = BookingHistory(
                                id=booking_id,
                                customer_id=data.get("customer_id"),
                                sailing_id=data.get("sailing_id") or "",
                                status=etype.split(".", 1)[1],
                                updated_at=_now(),
                                meta=data,
                            )
                        else:
                            row.customer_id = data.get("customer_id")
                            row.sailing_id = data.get("sailing_id") or row.sailing_id
                            row.status = etype.split(".", 1)[1]
                            row.updated_at = _now()
                            row.meta = data

                        s.add(row)
                        s.commit()
                except Exception:
                    # If needed, add DLQ / poison message handling here.
                    continue
