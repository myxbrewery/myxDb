dev_dest = '/home/tze/capstone'
prod_dest = '/home/ubuntu'
dest = prod_dest
print(f"""
\copy locations(id, name, image_url, lat, long, aggregation) FROM '%s/myxDb/assets/data/locations.csv' DELIMITER ';' CSV HEADER;
\copy status(id, name) FROM '%s/myxDb/assets/data/status.csv' DELIMITER ';' CSV HEADER;
\copy stalls(location, name, open, halal, qr_link, opening_time, closing_time, image_url, icon_url, uid, hashed_pw, card_settings, latest_menu_version, waiting_time, description, price, tags) FROM '%s/myxDb/assets/data/stalls.csv' DELIMITER ';' CSV HEADER;
""" %(dest, dest, dest))
