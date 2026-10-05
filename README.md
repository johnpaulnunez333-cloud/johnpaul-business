# Maya Shop

A business website with an admin panel. The admin controls products, stock, orders, and payment details. Customers pay through Maya by manual proof of payment, and the admin confirms each payment.

Everything runs on free tiers: GitHub, Render, Neon, and Cloudinary.

## Features

- Storefront built with React 18 and Bootstrap 5, with animations
- Cart saved in the browser, checkout, order tracking by code
- Maya QR and number shown at payment, customer uploads a screenshot
- Admin panel: dashboard, orders, products, settings
- Order flow: pending, paid, shipped, completed, or cancelled (stock is restored on cancel)
- Flask API with PostgreSQL (Neon) and image storage (Cloudinary)

## Project structure

```
app.py
requirements.txt
.env.example
.gitignore
templates/index.html
templates/admin.html
static/css/style.css
static/js/api.js
static/js/shop.js
static/js/admin.js
```

## Security built in

- Strict Content Security Policy, HSTS, no framing, same-origin referrer, locked permissions policy (Flask-Talisman)
- Rate limiting on every route, with tighter limits on login, orders, and uploads (Flask-Limiter)
- Admin login limited to 5 failed tries per 15 minutes per IP
- Passwords are hashed (scrypt) and checked in constant time; the same error is shown for a wrong username or password
- CSRF token on every write request, plus Origin header checking
- Session cookie is HttpOnly, Secure, SameSite=Strict, uses the `__Host-` prefix, and expires after 30 minutes
- Session is reset on login to prevent session fixation
- Server-side validation of every input, parameterized queries through SQLAlchemy, React escapes all output
- Prices and totals are always computed on the server, never trusted from the browser
- Stock is locked during checkout to prevent overselling
- Uploads are checked by file signature (JPG, PNG, WEBP only) and size, then stored on Cloudinary, never on the server disk
- Image URLs saved by the admin must come from Cloudinary
- API responses are not cached, and error messages never leak internals
- Optional secret admin URL through `ADMIN_PATH`

## Setup steps

### 1. Upload to GitHub

1. Create a new private repository on GitHub.
2. Upload all project files, keeping the folder structure.
3. Do not upload a `.env` file.

### 2. Create the database on Neon

1. Sign up at neon.tech and create a project.
2. Copy the connection string. It looks like `postgresql://user:password@host/dbname?sslmode=require`.

### 3. Create image storage on Cloudinary

1. Sign up at cloudinary.com.
2. Open the dashboard and copy the API environment variable. It looks like `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`.

### 4. Deploy on Render

1. Sign up at render.com and choose New, then Web Service.
2. Connect your GitHub repository.
3. Set Runtime to Python 3 and Instance Type to Free.
4. Set Build Command to `pip install -r requirements.txt`.
5. Set Start Command to `gunicorn app:app --workers 1 --threads 4 --timeout 60`.
6. Add the environment variables below.
7. Click Create Web Service and wait for the deploy to finish.

### 5. Environment variables

| Name | Value |
| --- | --- |
| APP_ENV | production |
| SECRET_KEY | a long random string, at least 40 characters |
| ADMIN_USER | your admin username |
| ADMIN_PASSWORD | a strong password, at least 12 characters |
| ADMIN_PATH | a secret URL word, for example `panel-x7k2` (optional) |
| DATABASE_URL | your Neon connection string |
| CLOUDINARY_URL | your Cloudinary API variable |
| PYTHON_VERSION | 3.11.9 |

### 6. First use

1. Open `https://your-app.onrender.com/your-admin-path` and sign in.
2. Go to Settings and enter your shop name, Maya account name, Maya number, and upload your Maya QR code.
3. Go to Products and add your products with images, prices, and stock.
4. Open the main site and place a test order.
5. In Orders, check the payment proof, then mark the order as paid, shipped, and completed.

## Daily admin routine

1. Check the Orders tab for new orders.
2. Open the payment proof and compare it with your Maya app.
3. Mark the order as paid only after the money is in your Maya account.
4. Ship the item, then mark it as shipped and completed.

## Important notes

- The Render free plan sleeps after 15 minutes without visitors, so the first load can take up to a minute. A free uptime monitor can ping the site to keep it awake.
- Rate limits are stored in memory, so keep the start command at one worker as shown above.
- Scripts load from the jsDelivr CDN with pinned versions. For stronger protection, add Subresource Integrity hashes or host the files yourself.
- Check Maya, PayMongo, Render, Neon, and Cloudinary for their current free limits and requirements, because they change.
- No website is unhackable. Use a strong unique admin password, keep dependencies updated, and never share your environment variables.

## Upgrade path

When you have real customers, move to a payment gateway such as PayMongo so payments are confirmed automatically by webhook. Add it as a new API route that marks the order as paid after verifying the gateway signature.

## Local run

1. Install the packages with `pip install -r requirements.txt`.
2. Set `APP_ENV=development`.
3. Run `python app.py` and open `http://127.0.0.1:5000`.
