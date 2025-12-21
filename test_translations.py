import requests
import json

try:
    # Try the fallback/default URL
    url = "http://localhost:8000/v1/translations/bundle/en/translation"
    print(f"Fetching from {url}...")
    r = requests.get(url)
    print(f"Status: {r.status_code}")
    print("Response JSON:")
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print(f"Error: {e}")
