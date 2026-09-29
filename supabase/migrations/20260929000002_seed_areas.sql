-- ~15 Chennai areas (PRD §2, §6). Approximate neighbourhood centroids.
insert into public.areas (name, lat, lng) values
  ('T. Nagar',        13.0418, 80.2341),
  ('Adyar',           13.0012, 80.2565),
  ('Velachery',       12.9815, 80.2180),
  ('Anna Nagar',      13.0850, 80.2101),
  ('Tambaram',        12.9249, 80.1000),
  ('OMR',             12.9416, 80.2362),
  ('Mylapore',        13.0368, 80.2676),
  ('Nungambakkam',    13.0569, 80.2425),
  ('Besant Nagar',    12.9986, 80.2669),
  ('Guindy',          13.0067, 80.2206),
  ('Porur',           13.0382, 80.1565),
  ('Kilpauk',         13.0827, 80.2420),
  ('Kodambakkam',     13.0521, 80.2255),
  ('Sholinganallur',  12.9010, 80.2279),
  ('Chromepet',       12.9516, 80.1462)
on conflict (name) do update set lat = excluded.lat, lng = excluded.lng;
