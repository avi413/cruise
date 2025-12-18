from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

import aio_pika

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
EVENTS_EXCHANGE = os.getenv("EVENTS_EXCHANGE", "cruise.events")


async def publish(routing_key: str, payload: dict[str, Any]) -> None:
    conn = await aio_pika.connect_robust(RABBITMQ_URL)
    try:
        channel = await conn.channel()
        exchange = await channel.declare_exchange(EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)

        body = json.dumps(
            {
                "type": routing_key,
                "time": datetime.now(tz=timezone.utc).isoformat(),
                "data": payload,
            }
        ).encode("utf-8")

        msg = aio_pika.Message(body=body, content_type="application/json", delivery_mode=aio_pika.DeliveryMode.PERSISTENT)
        await exchange.publish(msg, routing_key=routing_key)
    finally:
        await conn.close()
