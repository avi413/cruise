from __future__ import annotations

import json
import os
import logging
from datetime import datetime, timezone
from typing import Any

import aio_pika

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
EVENTS_EXCHANGE = os.getenv("EVENTS_EXCHANGE", "cruise.events")
EVENTS_STRICT = os.getenv("EVENTS_STRICT", "").strip().lower() in {"1", "true", "yes", "on"}

logger = logging.getLogger(__name__)


async def publish(routing_key: str, payload: dict[str, Any]) -> None:
    """
    Publish a domain event.

    In local/dev environments RabbitMQ may not be running. By default this is
    best-effort: failures are logged and do not break core booking flows.
    Set EVENTS_STRICT=1 to make failures fatal.
    """
    try:
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
    except Exception as e:
        if EVENTS_STRICT:
            raise
        logger.warning("Event publish failed (routing_key=%s): %s", routing_key, e)
        return
