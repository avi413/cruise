import json
import os
from datetime import date, datetime
from typing import Any
import dataclasses
from . import domain

DATA_FILE = os.getenv("DATA_FILE_PATH", "pricing_data.json")
SEED_FILE = "pricing_data.json"

def _json_default(obj):
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if dataclasses.is_dataclass(obj):
        return dataclasses.asdict(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def save_data(
    overrides_by_company: dict,
    price_categories_by_company: dict,
    cruise_price_tables_by_company: dict,
    fx_rates_by_company: dict
):
    # Convert keys to strings where necessary
    # cruise_price_tables: company -> sailing -> {(cabin, pc): cell}
    # JSON needs string keys. We can convert tuple keys to "cabin|pc" strings.
    
    serializable_tables = {}
    for cid, tables in cruise_price_tables_by_company.items():
        serializable_tables[cid] = {}
        for sid, cells in tables.items():
            serializable_tables[cid][sid] = {}
            for k, v in cells.items():
                # k is (cabin, pc)
                key_str = f"{k[0]}|{k[1]}"
                serializable_tables[cid][sid][key_str] = v

    # fx_rates: company -> {(base, quote): row}
    serializable_fx = {}
    for cid, rates in fx_rates_by_company.items():
        serializable_fx[cid] = {}
        for k, v in rates.items():
            # k is (base, quote)
            key_str = f"{k[0]}|{k[1]}"
            serializable_fx[cid][key_str] = v

    data = {
        "overrides": overrides_by_company,
        "categories": price_categories_by_company,
        "cruise_prices": serializable_tables,
        "fx_rates": serializable_fx
    }
    
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, default=_json_default, indent=2)

def load_data():
    path_to_load = DATA_FILE
    if not os.path.exists(DATA_FILE):
        if os.path.exists(SEED_FILE) and os.path.abspath(DATA_FILE) != os.path.abspath(SEED_FILE):
             print(f"Initializing data from {SEED_FILE}")
             path_to_load = SEED_FILE
        else:
             return {}, {}, {}, {}
        
    with open(path_to_load, "r") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            return {}, {}, {}, {}

    overrides = {}
    for cid, raw in data.get("overrides", {}).items():
        # Reconstruct PricingOverrides
        # category_prices is list of dicts, need to convert to CategoryPriceRule objects
        cat_prices = []
        for r in raw.get("category_prices") or []:
            cat_prices.append(domain.CategoryPriceRule(
                category_code=r["category_code"],
                currency=r["currency"],
                min_guests=r["min_guests"],
                price_per_person=r["price_per_person"],
                price_type=r.get("price_type", "regular"),
                effective_start_date=date.fromisoformat(r["effective_start_date"]) if r.get("effective_start_date") else None,
                effective_end_date=date.fromisoformat(r["effective_end_date"]) if r.get("effective_end_date") else None
            ))
            
        overrides[cid] = domain.PricingOverrides(
            base_by_pax=raw.get("base_by_pax"),
            cabin_multiplier=raw.get("cabin_multiplier"),
            demand_multiplier=raw.get("demand_multiplier"),
            category_prices=cat_prices if cat_prices else None
        )

    categories = data.get("categories", {})

    cruise_prices = {}
    for cid, tables in data.get("cruise_prices", {}).items():
        cruise_prices[cid] = {}
        for sid, cells in tables.items():
            cruise_prices[cid][sid] = {}
            for k_str, v in cells.items():
                parts = k_str.split("|")
                if len(parts) == 2:
                    k = (parts[0], parts[1])
                    cruise_prices[cid][sid][k] = v

    fx_rates = {}
    for cid, rates in data.get("fx_rates", {}).items():
        fx_rates[cid] = {}
        for k_str, v in rates.items():
            parts = k_str.split("|")
            if len(parts) == 2:
                k = (parts[0], parts[1])
                # Restore datetime
                if v.get("as_of"):
                    v["as_of"] = datetime.fromisoformat(v["as_of"])
                fx_rates[cid][k] = v

    return overrides, categories, cruise_prices, fx_rates
