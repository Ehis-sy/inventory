# GANKCO Inventory Management: setup guide

A web app for the team to track equipment: check-out and return, stock by location,
certificates and maintenance, reorder alerts, QR labels and Excel export.
It runs on GitHub Pages (the website) and Supabase (logins and database).

## 1. Set up the database (once)

1. In Supabase, open your project, then **SQL Editor → New query**.
2. Open `inventory-setup.sql`, copy everything, paste it in, and press **Run**.
   If Supabase warns about "destructive operations", confirm. That warning is about
   the lines that make the script safe to run twice.
3. You should see "Success". This creates the tables and security rules, and imports
   the 461 items from the October 2026 sheet into **Main Store**.

## 2. Supabase login settings

1. **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email".
   Admin approval already controls who gets in, and Supabase's free email service
   only sends a few emails per hour.
2. **Authentication → URL Configuration**: set **Site URL** to your GitHub Pages link
   (for example `https://YOUR-USERNAME.github.io/inventory/`). Add the same link under
   **Redirect URLs**. Password-reset emails need this.

## 3. Put the website on GitHub Pages

1. On GitHub, create a new **public** repository called `inventory`.
2. Choose **Add file → Upload files**. Drag in everything from this folder, including
   the `vendor` and `fonts` folders. Then commit.
3. Go to **Settings → Pages**. Under Source, pick **Deploy from a branch**, then
   **main** and **/ (root)**. Save.
4. After 1–2 minutes your link appears at the top of that page.

The code is public, but the inventory data is not: nobody can read anything without
an approved login.

## 4. First sign-in

1. Open the link and choose **Create an account**. **The first account created
   becomes the admin**, so do this before you share the link.
2. Send the link to your team. Each person creates an account, then you approve them
   under **Team** (Staff or Admin).
3. Make at least one more person an admin, so approvals never wait on one person.

## Day-to-day

- **Staff** check equipment out and in, receive deliveries, move stock, change status
  (reserved, in transit, damaged), issue consumables, sell sales items and record
  certificates. Their stock counts and write-offs go to an admin for approval.
- **Admins** also add and edit items, set reorder levels, approve requests, and manage
  locations and people.
- **Scan:** print QR labels from Inventory (tick items, then **Print labels**). Any phone
  camera opens the item from the label. USB or Bluetooth barcode scanners work anywhere
  in the app.
- **Export to Excel** on the Inventory page gives one sheet per department plus a
  restock list, in the same shape as the monthly sheet.

## Changing settings later

`config.js` holds the Supabase link and key, the app name and the version number.
Edit it on GitHub (pencil icon) to change them.
