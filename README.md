# GANKCO Nest: version 2.6 update

*Built to support engineered solutions.*

## Where things live



- **Website:** nest.gankcoenergy.com, hosted on GitHub Pages from **github.com/gankco-energy/gankco-nest** (organization owned by the Nest Gmail; Ehis is also an Owner).
- **Database and sign-in:** Supabase project in the **GANKCO Energy Services** organization (Nest Gmail; Ehis also an Owner).
- **Emails:** sent by Brevo from **nest-alerts@gankcoenergy.com** as "GANKCO Nest". Sign-in emails use Supabase's custom SMTP (templates in Supabase → Authentication → Emails → Templates). Alert emails use the Brevo API key saved in Supabase Vault as `brevo_api_key`, on a schedule (pg_cron).
- **DNS (company IT):** `nest` CNAME → `gankco-energy.github.io`, plus the Brevo verification records.

## Install 2.6 (about 15 minutes, once)

**From the next update on,** lock Nest first: **Settings → Maintenance → Schedule maintenance → All of Nest → Start now**, then run the SQL and upload, check Nest as a tester, and press **End maintenance**.

1. **Supabase → SQL Editor → New query:** paste all of **`7-nest-v2.6-upgrade.sql`** and press **Run**. Wait for **Success**. It's safe to run again.
2. **GitHub:** unzip **`gankco-nest-v2.6.zip`** and upload everything from the folder into **github.com/gankco-energy/gankco-nest** (**Add file → Upload files**), then commit. Keep the `CNAME` file.
3. After 1–2 minutes, anyone with Nest open sees **"A new version is available: Reload"**.

### Switch on the alert emails (one time)

1. **Check the schedule is on.** In Supabase, open **Database → Extensions** and make sure **pg_cron** and **pg_net** are switched on. If you had to switch either on, run the 2.6 SQL file again.
2. **Make a Brevo API key.** In Brevo, open the menu at the top right → **SMTP & API** → **API Keys** tab → **Generate a new API key**, name it **Nest alerts**. Copy it. This is a different key from the SMTP key Supabase already uses. **Don't paste it into a chat or email.**
3. **Save it in Supabase Vault.** In Supabase, open **Vault** (under Integrations, or search "Vault") → **Add new secret**. Name: **`brevo_api_key`**. Secret: paste the key. Save.
4. **Check it in Nest.** Go to **Settings → Alert emails**. **Brevo API key** and **Schedule** should both show ✔.
5. **Send yourself a test.** In **Try it**, pick yourself and **Daily**, then **Send to me now**. Check your inbox (and spam the first time). Try **Preview** for other people to see what they'll get.
6. **Test week.** Leave **Test mode** on for a week: only you receive the 7:30 am emails. When you're happy, turn **Test mode** off and press **Save**. Everyone then gets theirs.

If **Recent emails** shows "Brevo said 401", open Brevo → **Security → Authorised IPs** and turn off blocking of unknown IP addresses (Supabase sends from changing addresses).

## After installing

1. **Servicing rules:** for tools that must be serviced when idle, open the item → **Servicing → Set a rule** (or tick several items on Inventory → **Edit details** → *Service if idle on the shelf*).
2. **Testers:** **Settings → Maintenance → Choose testers** (for example Lydia).
3. **On order:** when you order something, open the item → **Mark on order**, with the quantity and expected date.

## What's new in 2.6

- **Alert emails** from nest-alerts@gankcoenergy.com, in the Nest email design:
  - **Daily at 7:30 am, Monday to Friday**, per person, in three groups. **Act today:** materials requests to approve and issue, approvals waiting (marked in red after 2 working days), reports to sign or returned, receipts to confirm, items overdue back, the monthly count (open or late), the monthly report to submit once the count is approved, new sign-ups, overdue certificates, expired kits, tools due for service, the monthly backup (Super Admin), and drafts left for more than 3 days. **Coming up:** certificates and kits due soon, items due back this week, servicing due within 30 days, Job planner jobs in the next 14 days that are short, and the count opening soon. **For your information:** items that fell below reorder level since yesterday, items newly marked faulty or damaged, and, on the first working day of the month, housekeeping (items with no location, no reorder level, certificates with no due date, planner parts with no price).
  - **Staff** only get their own items. Nobody gets an empty email.
  - **Monday 7:35 am:** admins get low stock split into *not ordered yet* and *on order* (late deliveries in red) plus everything faulty and not yet repaired. **Management** get a weekly summary: headline numbers, upcoming planner jobs (Ready or Short), the estimated ship-in cost and reports signed off that week.
  - **Settings → Alert emails** (Super Admin): on/off, test mode, status, **Preview** and **Send to me now** for anyone, and the last emails sent with Brevo's answer.
  - **My account → Email alerts:** anyone can turn their own emails off.
- **Maintenance lock** (Settings → Maintenance, Super Admin):
  - Lock **All of Nest** or a single app (Inventory, Purchase Order, Proforma Invoice & Quote), now or at a set time, with a message and a back-by time. **+15 min / +30 min** while it's on, and **End maintenance**.
  - **Heads-up banner** before it starts (30 minutes to 1 day before).
  - People see a branded maintenance screen (all of Nest) or a locked tile and app screen (one app). It happens within seconds for anyone already in Nest, and their page comes back by itself when you end it.
  - The database refuses changes while it's on, not just the screen. The Super Admin and chosen **testers** can still use Nest, with a bar saying maintenance is on.
- **Tool servicing:** an idle rule per item ("service if idle 12 months"). The item page shows last used, last serviced and next service, with **Mark serviced** and a service history. Reminders go in the alert emails.
- **On order:** mark an item on order with quantity, expected date and a note (for example the PO number). It shows on the item, the dashboard's restocking list and the Monday email, and clears itself when the stock is received.
- **Prices on every item:** the item page shows the unit price (USD or NGN) to admins, the Super Admin and Management, and admins can edit it. Staff still never see prices.
- **Job planner → Setup → Add part:** add BHA components, service tools, blank lengths or screen sizes beyond the original 20, then link them to Nest items. Existing jobs aren't affected (a new component counts as 0 on them until you edit the job).
- **App names:** Purchase Order and Proforma Invoice & Quote.

---

# Earlier: version 2.5 update

## Install 2.5 (about 3 minutes)

1. **Supabase → SQL Editor → New query:** paste all of **`6-nest-v2.5-upgrade.sql`** and press **Run**. Wait for **Success**. It's safe to run again.
2. **GitHub:** unzip **`gankco-nest-v2.5.zip`** and upload everything from the folder into **github.com/gankco-energy/gankco-nest** (**Add file → Upload files**), then commit. Keep the `CNAME` file.
3. After 1–2 minutes, anyone with Nest open sees **"A new version is available: Reload"**.
4. **Take the first backup:** Settings → Backups → **Download backup**. Save it in a **Nest Backups** folder in the Nest Gmail's Google Drive.

## What's new in 2.5

- **Backups (Super Admin, Settings → Backups):**
  - **Download backup** saves everything in Nest to one dated file (`gankco-nest-backup-YYYY-MM-DD.json`): items, stock, movements, materials requests, counts, sign-offs, signatures, prices, the job planner, users and the audit log. Tables added in future versions are included automatically.
  - The page shows the last backup (when and who) and when the next one is due.
  - **Monthly reminder:** from the 1st of each month, the Super Admin's bell shows **Monthly backup due** until a backup is downloaded that month.
  - **Make restore script from a backup file** turns a backup into SQL file(s) to run in Supabase's SQL Editor, in order. Restoring replaces all Nest data with the backup; sign-in accounts aren't touched. The handover guide has the full steps.
- **Settings → Email alerts** now says that sign-up, invitation and password emails come from nest-alerts@gankcoenergy.com.

---

# Earlier: version 2.4 update

## Install 2.4 (about 5 minutes)

1. **Supabase → SQL Editor → New query:** paste all of **`5-nest-v2.4-upgrade.sql`** and press **Run**. Wait for **Success**. It's safe to run again.
2. **GitHub:** unzip **`gankco-nest-v2.4.zip`** and upload everything from the folder into **github.com/gankco-energy/gankco-nest** (**Add file → Upload files**), then commit. Keep the `CNAME` file.
3. After 1–2 minutes, anyone with Nest open sees **"A new version is available: Reload"**.

## After installing

1. **Job planner → Setup** (Thru-Tubing admins or Super Admin): check which Nest item each part uses for each tubing size. Nest linked them by part number; the service tools (setting sleeves, extension rods, retrieving tools) are best guesses. Click a cell to change it.
2. **Fix two item codes:** the 2-7/8" Paragon II Packer is coded `GEST-TT-…` (typo), and `GES-TT-DHT-SCRN-150-0001DS` is used for both the 200µ and 230µ 1-1/2" screens. Give one of them a new code.
3. **Prices:** fill in the parts that show "no price" (for example the blanks, PCMs and EMSTs). Either press **Edit price** on a line of the **Ship-in list**, or use **Setup → Prices** for the full list.
4. **Management:** on the **Team** page, set managers' access to **Management**.
5. **Second Super Admin:** make one trusted person a Super Admin too, so Nest never depends on one account.

## What's new in 2.4

- **Credit line:** "Designed and built by Ehigie Momodu" on the sign-in page, the launcher footer and **My account → About Nest**. It isn't printed on PDFs, Excel files or labels.
- **Job planner** (menu → Job planner, for everyone). Your "Inventory vs Job Tracker" Excel, built into Nest for Thru-Tubing screen hang-off BHAs:
  - **Add upcoming job:** a job sheet with three sections (Job, String, BHA make-up) and a **Stock check** panel on the right that updates as you type. Each BHA row shows how many are free on the shelf for this job (✔ or ✖), plus the job's place in the date order.
  - **The jobs list** shows a **Ready** or **Short N parts** badge on each job, with the missing parts underneath.
  - Stock comes from **live Nest stock** (in store, available, all locations). There's no separate count to enter.
  - **Same rules as the sheet:** jobs are checked in date order, 10 ft blanks are pooled for 2-3/8" and 2-7/8", PCM and EMST are shared by 2-7/8" and 3-1/2", and service tools are needed once per size.
  - **Request** on a job creates a draft materials request with the right items. Once it's issued, the job counts as **Run** and its parts aren't counted again. This replaces the "Done" rows.
  - **Summary:** complete BHAs on the shelf per size and what limits them, plus surplus/shortfall for every part.
  - **Ship-in list:** split into short for jobs and safety top-up (Safety BHAs per size and spare EMSTs, set on Setup), with job-by-job shortages.
  - Your 8 upcoming jobs from the Excel are already loaded.
- **Management report:** "Inventory vs Upcoming Jobs" as a PDF or Excel, downloaded whenever needed (no sign-off). It covers headline numbers, job-by-job readiness, the ship-in order and complete BHAs.
- **USD prices:** loaded from your two PO sheets. The Ship-in list and report end with a **Total** row (units and estimated cost, noting any lines with no price).
  - **Seen by** admins, the Super Admin and Management. Staff never see prices.
  - **Changed only by** admins and the Super Admin, via **Edit price** on the Ship-in list, or **Setup → Prices** (Thru-Tubing admins and Super Admin). The database enforces this, and every change is in the audit log.
- **Management access:** view-only. It sees Overview, Inventory, Job planner, Reports and Sign-offs (with prices) and can download reports, but can't change anything. **View as → Management** shows you what they see.
- **Locations:** Port Harcourt and Warri are deleted. Admins can now **Delete** any location that has never been used.

---

# Earlier: version 2.3 update

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
