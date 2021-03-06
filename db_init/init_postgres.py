import time
import psycopg2
import os
from psycopg2.extras import RealDictCursor
import json

with open('.credentials.json') as f:
    data = json.load(f)
try:
    conn = psycopg2.connect(f"dbname={data['database']} user={data['user']} host={data['host']} password={data['password']}")
except:
    print("I am unable to connect to the database")

cur = conn.cursor()
# cur.execute("CREATE EXTENSION IF NOT EXISTS citext")
cur.execute("CREATE TABLE customers(id INTEGER PRIMARY KEY, \
    email VARCHAR(255), \
    age INTEGER, \
    name VARCHAR, \
    image VARCHAR, \
    diet TEXT[], \
    favorites TEXT[])")
cur.execute("CREATE TABLE locations(id INTEGER PRIMARY KEY, \
    name VARCHAR(255) NOT NULL, \
    image_url VARCHAR(255), \
    lat NUMERIC, \
    long NUMERIC, \
    aggregation BOOL)")
cur.execute("CREATE TABLE stalls(id SERIAL PRIMARY KEY, \
    location INTEGER REFERENCES locations(id), \
    name VARCHAR(255) NOT NULL, \
    open BOOL, \
    halal BOOL NOT NULL, \
    qr_link VARCHAR(255), \
    opening_time TIME[], \
    closing_time TIME[], \
    image_url VARCHAR(255), \
    icon_url VARCHAR(255), \
    uid VARCHAR, \
    hashed_pw VARCHAR, \
    card_settings JSON, \
    latest_menu_version INTEGER, \
    waiting_time NUMERIC, \
    description TEXT, \
    price INTEGER, \
    tags TEXT[])")
cur.execute('CREATE TABLE shelving(slot INTEGER, drink INTEGER)')
for i in range(1, 17):
    cur.execute('INSERT INTO shelving(slot, drink) VALUES (%s, 0)', (i,))
cur.execute("CREATE TABLE status(id INTEGER PRIMARY KEY, \
    name VARCHAR(255))")

conn.commit()
conn.close()

def execute_pg_query(query, args):
    try:
        conn = psycopg2.connect(f"dbname={data['database']} user={data['user']} host={data['host']} password={data['password']}", cursor_factory=RealDictCursor)
        cur = conn.cursor()
        cur.execute(query, args)
        response = cur.fetchall()
        conn.commit()
        conn.close()
        return response
    except Exception as e:
        print(e)
        return False

dev_dest = '/home/tze/capstone'
prod_dest = '/home/ubuntu'
dest = dev_dest
print(f"""
\copy locations(id, name, image_url, lat, long, aggregation) FROM '%s/myxDb/assets/data/locations.csv' DELIMITER ';' CSV HEADER;
\copy status(id, name) FROM '%s/myxDb/assets/data/status.csv' DELIMITER ';' CSV HEADER;
\copy stalls(location, name, open, halal, qr_link, opening_time, closing_time, image_url, icon_url, uid, hashed_pw, card_settings, latest_menu_version, waiting_time, description, price, tags) FROM '%s/myxDb/assets/data/stalls.csv' DELIMITER ';' CSV HEADER;
""" %(dest, dest, dest))

# csv_table_mapping = {
#     "category.csv": "category"
# }

# with open('user_accounts.csv', 'r') as f:
# next(f)
# cur.copy_from(f, 'users', sep=',')
# conn.commit()
# Execute these within postgres

# a = execute_pg_query("SELECT * FROM customers", ())
