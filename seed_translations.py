import json
import urllib.request
import urllib.error
import time

# Base URL for the API
BASE_URL = "http://localhost:8000"
TRANSLATIONS_URL = f"{BASE_URL}/v1/translations"
LOGIN_URL = f"{BASE_URL}/v1/platform/login"

TRANSLATIONS = {
    "en": {
        "translations_page.title": "Translations Management",
        "translations_page.add_edit_title": "Add / Edit Translation",
        "translations_page.language": "Language",
        "translations_page.namespace": "Namespace",
        "translations_page.key": "Key",
        "translations_page.value": "Value",
        "translations_page.save": "Save",
        "translations_page.table_lang": "Lang",
        "translations_page.table_namespace": "Namespace",
        "translations_page.table_key": "Key",
        "translations_page.table_value": "Value",
        "translations_page.actions": "Actions",
        "translations_page.edit": "Edit",
        "translations_page.delete": "Delete",
        "translations_page.no_translations": "No translations found.",
        "translations_page.confirm_delete": "Are you sure?"
    },
    "he": {
        "translations_page.title": "ניהול תרגומים",
        "translations_page.add_edit_title": "הוספה / עריכה של תרגום",
        "translations_page.language": "שפה",
        "translations_page.namespace": "מרחב שם",
        "translations_page.key": "מפתח",
        "translations_page.value": "ערך",
        "translations_page.save": "שמור",
        "translations_page.table_lang": "שפה",
        "translations_page.table_namespace": "מרחב שם",
        "translations_page.table_key": "מפתח",
        "translations_page.table_value": "ערך",
        "translations_page.actions": "פעולות",
        "translations_page.edit": "ערוך",
        "translations_page.delete": "מחק",
        "translations_page.no_translations": "לא נמצאו תרגומים.",
        "translations_page.confirm_delete": "האם אתה בטוח?"
    }
}

def get_token():
    print(f"Logging in to {LOGIN_URL}...")
    data = {
        "email": "admin@platform.local",
        "password": "admin"
    }
    req = urllib.request.Request(
        LOGIN_URL,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'User-Agent': 'seed-script'}
    )
    try:
        with urllib.request.urlopen(req) as f:
            resp = json.loads(f.read().decode('utf-8'))
            return resp.get('access_token')
    except urllib.error.URLError as e:
        print(f"Login failed: {e}")
        try:
            # Try to read error body if possible
             if hasattr(e, 'read'):
                print(e.read().decode('utf-8'))
        except:
            pass
        return None

def seed():
    token = get_token()
    if not token:
        print("Cannot seed without authentication.")
        return

    print(f"Seeding translations to {TRANSLATIONS_URL}...")
    count = 0
    errors = 0
    headers = {
        'Content-Type': 'application/json', 
        'User-Agent': 'seed-script',
        'Authorization': f'Bearer {token}'
    }

    for lang, items in TRANSLATIONS.items():
        for key, value in items.items():
            data = {
                "lang": lang,
                "namespace": "translation",
                "key": key,
                "value": value
            }
            req = urllib.request.Request(
                TRANSLATIONS_URL, 
                data=json.dumps(data).encode('utf-8'),
                headers=headers
            )
            try:
                with urllib.request.urlopen(req) as f:
                    if f.status in (200, 201):
                        count += 1
                        # print(f"Added {lang}: {key}")
            except urllib.error.URLError as e:
                print(f"Failed to add {lang}.{key}: {e}")
                errors += 1
    
    print(f"Finished. Added/Updated: {count}, Errors: {errors}")

if __name__ == "__main__":
    seed()
