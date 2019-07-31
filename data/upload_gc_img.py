import psycopg2
import json
import os

with open('.credentials.json') as f:
    credentials = json.loads(f.read())

conn = psycopg2.connect(dbname = credentials["database"],
                        user = credentials["user"],
                        password = credentials["password"],
                        host = credentials["host"])


cursor = conn.cursor()

cursor.execute("SELECT * FROM gong_cha_menu")
gc_items = cursor.fetchall()

missing_items = []

for item in gc_items:
    cursor = conn.cursor()
    if os.path.exists(f"assets/images/gong_cha/{item[1].lower().replace(' ', '_').replace('(','').replace(')','').replace('&','').replace('__','_')}.png"):
        path_name = f"gong_cha/{item[1].lower().replace(' ', '_').replace('(','').replace(')','').replace('&','').replace('__','_')}.png"        
        cursor.execute(f"UPDATE gong_cha_menu SET image_url = '{path_name}' WHERE name = '{item[1]}'")
        conn.commit()
    else:
        missing_items.append(item[1])
        print("DONT EXIST:", item[1])
    cursor.close()

missing_items
