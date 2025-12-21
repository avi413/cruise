import requests
import json
import os

# Try hitting the edge-api (8000) which proxies to customer-service
url = "http://localhost:8000/v1/translations/bundle/en/translation"
print(f"Fetching from {url}...")
try:
    r = requests.get(url)
    print(f"Status: {r.status_code}")
    try:
        data = r.json()
        print("Response JSON keys (top level):")
        print(list(data.keys()))
        print("Sample content:")
        print(json.dumps(data, indent=2)[:500]) # First 500 chars
    except:
        print("Could not parse JSON")
        print(r.text)
except Exception as e:
    print(f"Error: {e}")
