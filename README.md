# GANKCO Nest: version 2.3 update

*Built to support engineered solutions.*

## Install 2.3 (about 5 minutes)

1. **Supabase → SQL Editor → New query:** paste all of **`4-nest-v2.3-upgrade.sql`** and press **Run**. Wait for **Success**. It's safe to run again.
2. **GitHub:** unzip **`gankco-nest-v2.3.zip`** and upload everything from the folder into your `inventory` repository (**Add file → Upload files**), then commit. Keep the `CNAME` file.
3. After 1–2 minutes, anyone with Nest open sees **"A new version is available: Reload"**.

## First things to do

1. **Team page:** set everyone's **job title** (use **Set** in the Job title column). It's printed under their name when they sign.
2. **Everyone:** go to **My account → Upload signature**. Sign on plain white paper with a dark pen, then take a straight photo in good light or scan it. Nest removes the white background and shows a preview before saving.

## What's new in 2.3

- **Printer-friendly PDFs (Design A):** white page, colour logo, one thin orange line, light grey table headers. Statuses are bold coloured text. A category heading never gets stranded at the bottom of a page. **Excel downloads** use the same light header.
- **Signatures on documents.** Each box shows the signature, name, job title and "Signed in GANKCO Nest · date and time". Boxes nobody signed stay blank for a pen.
  - **Monthly count:** "Counted by" (who submitted it) and "Approved by" (the admin who approved it).
  - **Load-out Manifest:** "Issued by" for each service line's admin, and the requester's box once they press **Confirm receipt**.
  - **Inventory list, certificate and kit lists, plain report downloads:** "Prepared by" is whoever downloads them.
- **Confirm receipt:** once every line on a materials request is issued or rejected, the requester sees **Confirm receipt** (and a bell reminder). It signs the Requester box.
- **Report sign-off (Sign-offs in the menu):**
  - On **Reports**, choose the line and period, then **Sign & submit**. The figures are frozen at that moment.
  - The line's admin gets a bell alert and either **signs** or **returns** it with a comment. The preparer can't review their own report; if no other admin is in the line, it goes straight to the Super Admin.
  - The Super Admin **signs & approves**, and the report is **final**. Until then its PDF carries a light "DRAFT" mark.
  - If it's returned, the preparer presses **Update figures**, checks the report and presses **Sign & resubmit**. It starts again from the line admin.
  - Reports for all lines go preparer → Super Admin. Comparisons can't be signed off. Each period and line is signed off once (it can be withdrawn before it's final).
- **Who sees signatures:** active users see them only inside signed documents. Only the owner can upload or replace their own; the Super Admin can remove anyone's from the Team page. Documents already signed keep the signature they were signed with.
- Every signature is recorded in the **Audit log**.
- **Item codes are easier to read:** light orange tag with dark orange text across Nest. Printed QR labels use bold black text in a thin black outline on white, so they print sharply on any printer.

---

# Earlier: version 2.2 update

*Built to support engineered solutions.*

## Install 2.2 (about 2 minutes, no SQL)

1. **GitHub:** unzip **`gankco-nest-v2.2.zip`** and upload everything from the folder into your `inventory` repository (**Add file → Upload files**), then commit. Keep the `CNAME` file.
2. After 1–2 minutes, anyone with Nest open sees **"A new version is available: Reload"**.

## What's new in 2.2

- **The Nest home screen fits on one screen on a laptop or desktop.** No scrolling.
- The three tiles (Inventory, Purchase Orders, Proforma Invoices & Quotes) sit in one row, and the welcome area is shorter.
- **Team & access is now a button in the top bar** (admins and Super Admin only). Staff don't see it.
- On phones, the tiles still stack and scroll as before.

---

# Earlier: version 2.1 update

*Built to support engineered solutions.*

## Install 2.1 (about 5 minutes)

1. **Supabase → SQL Editor → New query:** paste all of **`3-nest-v2.1-upgrade.sql`** and press **Run**. Wait for **Success**. It's safe to run again.
2. **GitHub:** unzip **`gankco-nest-v2.1.zip`** and upload everything from the folder into your `inventory` repository (**Add file → Upload files**), then commit. Keep the `CNAME` file.
3. After 1–2 minutes, anyone with Nest open sees **"A new version is available: Reload"**.

## What's new in 2.1

- **Materials requests** replace job tickets and are numbered **MR-2026-0001** onward. Existing tickets are renumbered.
  - **Requester** is chosen from a list of active users and starts on the person creating the request.
  - **Each service line's admin approves and issues their own items.** A request can be **Partly issued** while another line is still deciding. A rejected line shows the reason, and the other lines can still go.
  - When an admin raises a request, items from their own line(s) are issued as soon as they submit.
  - **Add to materials request**: tick items on the Inventory page to start or add to a draft request.
  - **The requester is notified** when their items are issued or rejected, or when a request is overdue for return.
  - The **Load-out Manifest** has a Requester box and an **Issued by** box for each service line.
- **View as** (Super Admin): pick a role and service line(s) to see Nest exactly as they do. It's read-only, with an orange bar and an **Exit** button.
- **Nest home tiles:** Inventory, Purchase Orders (coming later), Proforma Invoices & Quotes (coming later), and Team & access (admins).
- **Sign-ups:** only **@gankcoenergy.com** addresses can create an account. On the **Team** page, accounts on other addresses (including yours, if it's personal) show **Fix email**. It gives you a short piece of code to run in Supabase that moves the account to its company email, keeping its password and history.
- **Wording:** "GANKCO Nest · Built to support engineered solutions" inside Nest, and "GANKCO Energy Services Limited · Providing engineered solutions" wherever the company is named.

---

# Earlier: upgrade to version 2.0

*Built to support engineered solutions.*

Version 2.0 turns the inventory app into **GANKCO Nest**: one sign-in, then a launcher with **Inventory** now and **Sales & Finance** later.

## Before you start

Ask the team to stop using the app for about 15 minutes. Nothing is lost, but changes made in the middle of the upgrade could fail.

## Step 1: Upgrade the database (Supabase)

1. Open your project in Supabase and go to **SQL Editor → New query**.
2. Open **`1-nest-upgrade.sql`**, copy everything, paste it in and press **Run**. If Supabase warns about "destructive operations", confirm. Wait for **Success**.
3. Start another **New query**. Paste in **`2-nest-history.sql`** and press **Run**. This loads the 17 monthly sheets (Dec 2024 to Oct 2026) so month-to-month comparisons work.

Both files are safe to run again: nothing gets duplicated.

What the upgrade changes:
- Your account becomes **Super Admin**. Everyone else keeps their role (Admin or Staff).
- Every existing admin and staff member is temporarily given **all four service lines**. You narrow this down in step 3.
- The "Main Store" placeholder is renamed **Location not set**. **Port Harcourt** and **Warri** are added.
- Redress-kit items are flagged so their kit numbers and expiry dates can be tracked.

## Step 2: Update the website (GitHub)

1. Unzip **`gankco-nest-v2.0.zip`**.
2. In your `inventory` repository, choose **Add file → Upload files**. Drag in everything from the unzipped folder, including the `js`, `vendor`, `fonts` and `brand` folders, then **Commit**.
3. Don't delete the file called **`CNAME`** in the repository. It keeps `inventory.gankcoenergy.com` working.
4. Optional tidy-up: you can delete the old **`app.js`**, **`favicon.svg`** and **`vendor/xlsx.full.min.js`**. Version 2.0 doesn't use them.
5. Wait 1–2 minutes, then open https://inventory.gankcoenergy.com and press **Ctrl + Shift + R**.

From now on, whenever a new version is published, Nest shows a **"new version available: Reload"** bar, so nobody has to clear their browser.

## Step 3: Set up the team (you, as Super Admin)

Open **Inventory → Team**.

1. **Access:** set your 3 admins to **Admin**. Everyone else stays **Staff**.
2. **Service lines:** press **Lines** next to each person and tick only the line(s) they work in.
3. **Who approves for each line:** choose a **main admin** and a **backup admin** for each line. Their approval requests and alerts go to them. You can approve anything.
4. New people sign up through the link, then appear under **Waiting for approval**. Press **Approve**, tick their line(s), and they're in.

## Step 4: First tasks for each service line

- **Put items in Port Harcourt or Warri.** Everything currently shows as *Location not set*. On Inventory, filter **Location not set**, tick items, then **Move location**. Or use **Excel templates → Item locations**, fill it in, and upload it.
- **Reorder levels:** admins tick items, choose **Edit details**, and set "Reorder at". Low-stock alerts start working.
- **Redress kits:** open a kit item and use **Add / update kit**, or use **Excel templates → Redress kits & expiry dates**. Enter one row per component per kit number. Leave the expiry blank if a component doesn't expire.

## How things work

| Task | Where |
|---|---|
| Send equipment to a job | **Materials requests → New materials request**. Add items, **Submit**. Each line's admin presses **Approve & issue**. Print the **Load-out Manifest**, then **Record return** when items come back (good, damaged, used, sold or missing). |
| Correct many numbers at once | **Inventory → Edit quantities**. Type the new numbers, then **Review & submit**. Staff changes go to their line's admin as one request. |
| Monthly count (23rd–26th) | **Monthly count**: start your line's count, tick ✓ or type the real number, then **Submit**. The admin approves, and the month is locked and signed. |
| Approvals | **Approvals**: approve one request, ticked requests, or **Approve all** for a line. Single lines inside a request can be approved or rejected too. |
| Alerts | The **bell** shows low stock, faulty items, certificates and kits expiring, the count window, overdue returns and approvals. Email alerts can be switched on once `noreply@gankcoenergy.com` is ready. |
| Who changed what | **Audit log** (admins). Filter by person, service line, kind of change or date. Edits show the value before and after. |
| Reports | **Reports**: monthly, quarterly, annual, or compare two months. Download as **PDF** or **Excel**. Both are branded and carry the QMS reference. |

## Roles

- **Staff:** day-to-day work in their own service line(s). They can see all stock but not the Setup section.
- **Admin:** approves and manages items for their lines, and also handles locations, labels, new staff and the audit log.
- **Super Admin:** everything, plus creating admins, choosing approvers, settings, and the full audit log.

## Settings

As Super Admin, go to **Settings** to change the count dates, how early kit and certificate warnings appear, and the QMS form details printed on reports.
