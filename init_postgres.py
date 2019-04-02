import time
import psycopg2
import os
from psycopg2.extras import RealDictCursor
import json

with open('credentials.json') as f:
    data = json.load(f)
try:
    conn = psycopg2.connect(f"dbname={data['database']} user={data['user']} host={data['host']} password={data['password']}")
except:
    print("I am unable to connect to the database")

cur = conn.cursor()
# cur.execute("CREATE EXTENSION IF NOT EXISTS citext")
# What if Google and FB have clashing ids?
cur.execute("CREATE TABLE customers(id INTEGER PRIMARY KEY, email VARCHAR(255), age INTEGER, name VARCHAR, image VARCHAR, diet TEXT[])")
cur.execute("CREATE TABLE locations(id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL, image_id VARCHAR(255), aggregation BOOL)")
cur.execute("CREATE TABLE stalls(id INTEGER NOT NULL PRIMARY KEY, location INTEGER REFERENCES locations(id), name VARCHAR(255) NOT NULL, open BOOL, halal BOOL NOT NULL, qr_link VARCHAR(255) NOT NULL, opening_time TIME, closing_time TIME, image_id VARCHAR(255))")
cur.execute("CREATE TABLE receipts(id SERIAL PRIMARY KEY, customer_id INTEGER REFERENCES customers(id) NOT NULL, paid BOOL NOT NULL, start_date TIMESTAMP NOT NULL, payment_date TIMESTAMP, total_payment NUMERIC(10,6) NOT NULL, special_request VARCHAR(255))")
cur.execute("CREATE TABLE category(id INTEGER PRIMARY KEY, name VARCHAR(255))")
cur.execute("CREATE TABLE status(id INTEGER PRIMARY KEY, name VARCHAR(255))")
cur.execute("CREATE TABLE items(location_id INTEGER REFERENCES locations(id), stall_id INTEGER REFERENCES stalls(id), id INTEGER NOT NULL, name VARCHAR(255) NOT NULL, in_stock BOOL, school_price NUMERIC(10,6), public_price NUMERIC(10,6), category INTEGER REFERENCES category(id), kcal INTEGER, compulsory_option_1 TEXT[], compulsory_option_2 TEXT[], modifier_1 TEXT[], modifier_1_cost NUMERIC(10,6), modifier_2 TEXT[], modifier_2_cost NUMERIC(10,6), upsize_1_cost NUMERIC(10,6), upsize_2_cost NUMERIC(10,6), tags TEXT[], image_url TEXT)")
cur.execute("CREATE TABLE orders(id SERIAL PRIMARY KEY, stall_id INTEGER REFERENCES stalls(id), item_id INTEGER, customer_id INTEGER REFERENCES customers(id), base_price numeric(10, 6) NOT NULL, total_price numeric(10, 6) NOT NULL, compulsory_option_1 TEXT, compulsory_option_2 TEXT, modifier_1 TEXT, modifier_2 TEXT, status_id INTEGER REFERENCES status(id), start_datetime TIMESTAMP, end_datetime TIMESTAMP, receipt_id INTEGER REFERENCES receipts(id))")
cur.execute("CREATE TABLE paylah_url(id SERIAL PRIMARY KEY, value NUMERIC(10,6), url TEXT)")
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

# Execute these within postgres
\copy locations(id, name, image_id, aggregation) FROM '/home/ubuntu/myxDb/data/locations.csv' DELIMITER ',' CSV HEADER;
\copy stalls(id, location, name, open, halal, qr_link, opening_time, closing_time, image_id) FROM '/home/ubuntu/myxDb/data/stalls.csv' DELIMITER ',' CSV HEADER;
\copy category(id, name) FROM '/home/ubuntu/myxDb/data/category.csv' DELIMITER ',' CSV HEADER;
\copy status(id, name) FROM '/home/ubuntu/myxDb/data/status.csv' DELIMITER ',' CSV HEADER;
\copy items(location_id, stall_id,id,name,in_stock,school_price,public_price,category,kcal,compulsory_option_1,compulsory_option_2,modifier_1,modifier_1_cost,modifier_2,modifier_2_cost,upsize_1_cost,upsize_2_cost,tags,image_url) FROM '/home/ubuntu/myxDb/data/items.csv' DELIMITER ',' CSV HEADER;

a = execute_pg_query("SELECT * FROM customers", ())
print(a)
