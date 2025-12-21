
flat = {
    "app.title": "Cruise Management",
    "translations_page.title": "Translations",
    "translations_page.add_edit_title": "Add / Edit Translation"
}

result = {}
for key, value in flat.items():
    parts = key.split(".")
    d = result
    for part in parts[:-1]:
        if part not in d:
            d[part] = {}
        if not isinstance(d[part], dict):
            d[part] = {}
        d = d[part]
    d[parts[-1]] = value

import json
print(json.dumps(result, indent=2))
