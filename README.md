# GANKCO Nest: version 3.0 update (PeopleCore)

*Built to support engineered solutions.*

## Where things live

- **Website:** nest.gankcoenergy.com, hosted on GitHub Pages from **github.com/gankco-energy/gankco-nest** (organization owned by the Nest Gmail; Ehis is also an Owner).
- **Database and sign-in:** Supabase project in the **GANKCO Energy Services** organization (Nest Gmail; Ehis also an Owner).
- **Emails:** sent by Brevo from **nest-alerts@gankcoenergy.com** as "GANKCO Nest". Sign-in emails use Supabase's custom SMTP (templates in Supabase → Authentication → Emails → Templates). Alert emails use the Brevo API key saved in Supabase Vault as `brevo_api_key`, on a schedule (pg_cron).
- **DNS (company IT):** `nest` CNAME → `gankco-energy.github.io`, plus the Brevo verification records.

## Install 3.0 (about 5 minutes)

1. **Lock Nest:** **Nest admin → Nest settings → Maintenance → Schedule maintenance → All of Nest → Start now**.
2. **Supabase → SQL Editor → New query:** paste all of **`16-nest-v3.0-upgrade.sql`** and press **Run**. It should end with **Nest 3.0 (PeopleCore) installed**. It's safe to run again. Nothing in Inventory or Purchase Orders changes.
3. **GitHub:** unzip **`gankco-nest-v3.0.zip`** and upload everything into **github.com/gankco-energy/gankco-nest**, then commit. Keep the `CNAME` file.
4. Reload Nest (**Ctrl + Shift + R**). The bottom of each page shows **v3.0**. End the maintenance.
5. **PeopleCore → PeopleCore settings → HR team:** add the HR people (HR admin or HR officer).

### What's new in 3.0: PeopleCore (Wave 1a)
- **A new app on the Nest home page.** Every Nest user gets it (self-service). Switch it off for someone on the Team page like any other app.
- **My profile:** each person's details, next of kin, documents, job history and their bank, tax and pension section. Staff send a **change request**; HR checks it, then the record updates. Changes to bank, tax or pension details go to **HR admins only**.
- **Directory** of everyone, and **My team** for line managers (direct reports and the people further down, with confirmation dates).
- **Approvals:** an inbox for requests waiting for you, your own requests, and (HR) all requests. Bell alerts, a line in the daily email, and a reminder when a step waits too long. **Stand-ins** approve for you while you're away.
- **Org chart** from the structure, with vacant positions, external advisers and dotted lines. Fit, zoom and print (A3).
- **Staff records (HR):** add and edit people, move them to a new position (kept in job history), photos, documents with expiry dates, and the **locked section** (bank, account, TIN, PFA, RSA PIN, NHF, NIN). Only HR admins and the person see it, and every look is logged.
- **PeopleCore settings (HR admins):** units and positions (everything can be changed, including who reports to whom), grades, locations and employment types, **custom fields** with who-can-see-it (everyone, managers, HR, locked), **approval chains** (line manager, next level up, head of department, HR, a position or a named person, with conditions), **employee numbers** (GES + running number + year joined, e.g. GES0052022; HR can overwrite) and the **activity log**.
- **Excel:** staff and organisation templates to download, fill and upload. These are starting formats until HR agrees the final columns.
- **Staff without a company email** can create a Nest account with the email HR has on their PeopleCore record.
- The structure starts from the organogram (positions only, no names). HR fills in the people.
- **Fix:** dates in Excel templates no longer show a day early (this affected redress kit expiry dates).

## Install 2.9.1 (already done, for reference)

1. **GitHub:** unzip **`gankco-nest-v2.9.1.zip`** and upload everything into **github.com/gankco-energy/gankco-nest**, then commit. Keep the `CNAME` file. No SQL to run.
2. Reload Nest (**Ctrl + Shift + R**). The bottom of each page shows **v2.9.1**.

### What's new in 2.9.1
- **Uploading a template:** Nest recognises which template the file is (items, quantity corrections, locations or redress kits), so there's nothing to choose and a file can't be read as the wrong kind.
- **Quantity corrections:** if numbers were typed in **Current qty** instead of **New qty**, the preview says so and offers **Use the numbers I typed in Current qty**. When there's nothing to change, it says to use the New qty column.
- **Location filter** works for any location name, including names with a comma (for example *Operations Base, Portharcourt*), and the **View stock** button on Locations uses it too.
- **Renaming a location** updates the Inventory lists straight away, without a reload.



## Install 2.9 (already done, for reference)

1. **Lock Nest:** **Nest admin → Nest settings → Maintenance → Schedule maintenance → All of Nest → Start now**.
2. **Supabase → SQL Editor → New query:** paste all of **`14-nest-v2.9-upgrade.sql`** and press **Run**. It should end with **Nest 2.9 installed**. It's safe to run again: items that already have a place are never moved again.
3. **GitHub:** unzip **`gankco-nest-v2.9.zip`** and upload everything into **github.com/gankco-energy/gankco-nest**, then commit. Keep the `CNAME` file.
4. Reload Nest (**Ctrl + Shift + R**). The bottom of each page shows **v2.9**.
5. **Check, as the Super Admin:**
   - **Inventory:** the four filters at the top (Service line, Sub service line, Type, Sub-type). Every item has a place; the line under each description shows it, for example *WI · Wireline Services · Slickline Downhole Tools*.
   - **Nest admin → Nest settings → Service lines:** the team for each sub service line. Set a team for any sub line that will get items (Cased Hole Logging, Well Testing and so on).
   - **Inventory → Inventory settings → Types & sub-types.**
6. Press **End maintenance**.

### What's new in 2.9

**Inventory filters**
- **Service line → Sub service line → Type → Sub-type.** The sub line list follows the service line, and the sub-type list follows the type (picking a sub-type on its own sets its type). **Redress kits only** is a tick box; **Clear filters** resets them.
- The service-line buttons at the top of Inventory are gone. The table columns are the same (code, description, each store, out, status, total).
- **Excel and PDF exports** are grouped by sub service line, then type and sub-type, and say which filters were used.

**Types and sub-types (they replace categories)**
- Four types: **Sales items** (leave for good), **Rental items** (go out on jobs and come back), **Consumables** (used up) and **Company tools & assets** (go out and come back, for now). The type decides how an item behaves on jobs.
- Sub-types under each type, from your alignment sheet. **Inventory settings → Types & sub-types** (Super Admin and admins): add, rename, reorder, archive, or delete one that no item uses.
- Every item was moved to its new place from the sheet you filled in (categories, the 96 single items, and the 75 Job planner items by name). The Audit log isn't flooded: placing items isn't an edit.

**Service lines: one list for Inventory and PO**
- **Nest admin → Nest settings → Service lines** (Super Admin): add, rename, reorder or archive service lines and sub lines, and choose the **team** for each sub line (that team's admins look after its items and approve changes). Changing a sub line's team hands its items to the new team.
- **FLM & SLM** (was First- & Second-Line Maintenance Service), in both apps.
- **Company-wide → Quality, Health, Safety & Environment** for QHSE items. It isn't offered on POs.
- A main line's code can't change once POs have been issued with it.

**Moving items (admins)**
- Tick items → **Move to…** → service line, sub line, type and sub-type ("No change" leaves a field as it is). **Edit item** does the same for one item.
- Admins can move items into **another team's** sub line; that team's admins get a bell alert and the items become theirs.
- An item's type can't change while some of it is out on a job.
- The item's **History** shows each move (old → new, who, when); the Audit log has it too.

**Bulk items template** (Inventory → Excel templates → *Items: add and edit*)
- Download: every item shown on the Inventory page (set the filters first to narrow it), with dropdowns for service line, sub line, type and sub-type, plus 150 empty rows for new items with an opening quantity per store.
- Upload: a preview shows every change as old → new, new items in green, and rows to fix in red. Only cells you changed count: if something was changed in Nest after you downloaded the file, Nest keeps that change and tells you.
- Admins' changes save straight away. **Staff uploads go to their team's admin** as one request in **Approvals**, and are applied when approved. No prices in the template.

**Fixes**
- **PDF and Excel downloads work on every computer.** Some browser add-ons put a "script loader" on every web page, which took the PDF tool away from Nest (*"Cannot read properties of undefined (reading 'jsPDF')"*). Nest now loads its tools so add-ons can't interfere, and a tool that fails to load (slow internet) is tried again on the next press.
- **Locked app tiles:** someone without Inventory (or Purchase Order) access sees the tile greyed out with a lock and *"You don't have access. Ask the Nest admin."*

**Supabase advisors after 2.9:** about eight more *"signed-in users can execute security definer function"* warnings for the new buttons (Move to, Save item, bulk template, sub-types, service lines). They're by design, like the others.

## Install 2.8.1 (already done, for reference)
. **Lock Nest:** **Nest admin → Nest settings → Maintenance → Schedule maintenance → All of Nest → Start now**.
2. **Supabase → SQL Editor → New query:** paste all of **`13-nest-v2.8.1-upgrade.sql`** and press **Run**. It should end with **Nest 2.8.1 installed**. It's safe to run again. (It already contains the 2.8.1 security fix, so it doesn't matter whether `12-nest-v2.8.1-security-fix.sql` was run first.)
3. **GitHub:** unzip **`gankco-nest-v2.8.1.zip`** and upload everything into **github.com/gankco-energy/gankco-nest**, then commit. Keep the `CNAME` file.
4. Reload Nest (**Ctrl + Shift + R**). The version at the bottom of each page shows v2.8.1.
5. **Check:** Purchase Order → Purchase orders → **All**: drafts on top, then 10038 onwards newest first, then the old POs by date. Suppliers: the suppliers from old POs are there with their details.
6. **Supabase → Advisors:** refresh **Performance Advisor** (the 20 warnings should be gone) and **Security Advisor** (only the expected warnings stay: see below).
7. Press **End maintenance**.

### What's new in 2.8.1

**PO list**
- **Order:** drafts first (the one edited last on top), then POs issued in Nest by PO number (newest on top), then old POs added from before Nest by PO date (newest on top). Every filter and the Excel download use this order.
- **Click a column heading to sort** by it (PO number, PO date, supplier, service line, delivery, order amount, status, raised by). Press again to reverse, a third time for the default order, or **Back to the default order**. POs without a value (such as drafts without a number) always go to the bottom. On a phone there's an **order** picker under the filters. The Excel download follows the order on screen and says how it was sorted.

**Suppliers from old POs**
- When an old PO is added (one by one or in bulk) and its supplier isn't in the Suppliers list, the supplier is added with its **address, phone and fax**. A "Phone: … Fax: …" written together is split into the two boxes.
- If the supplier is already in the list, Nest **only fills in details it's missing**; nothing already saved is replaced.
- The old POs already in Nest were run through the same check when you installed 2.8.1.
- **Add one by hand** now has optional address, phone and fax boxes, and says whether the supplier is new or already in the list.

**Security and speed (Supabase advisors)**
- The 2.8.1 security fix is part of the upgrade: only signed-in people can call Nest's functions, Nest's internal helpers can't be called directly, and signed-out visitors can only read the maintenance notice on the sign-in page.
- The database's security rules were made faster without changing who can do what:
  - the "who is signed in" check runs once per request instead of once per row;
  - each table has separate rules for adding, changing and deleting instead of one catch-all rule;
  - every link between tables has an index.
- Checked by comparing, for every test user and every table, what they could read, change and delete before and after: identical.

**Security Advisor: warnings that are expected and stay**
- *Signed-in users can execute security definer function* (about 96): by design. Each one is a Nest button or a yes/no check the security rules use, and each checks the person's role inside.
- *anon can execute maint_public*: by design (the sign-in page maintenance notice).
- *Leaked password protection*: a switch in Supabase → Authentication (it may need a paid plan). Turn it on if your plan allows.
- **Performance Advisor "Unused index" (info):** normal while tables are small; Postgres reads small tables directly. Leave them.



## Installing 2.8 (for reference: already done)

1. **Lock Nest:** **Nest admin → Nest settings → Maintenance → Schedule maintenance → All of Nest → Start now**. (Before you upload 2.8, this is still **Settings → Maintenance** in Inventory.)
2. **Supabase → SQL Editor → New query:** paste all of **`11-nest-v2.8-upgrade.sql`** and press **Run**. It should end with **Nest 2.8 installed**. It's safe to run again.
3. **GitHub:** unzip **`gankco-nest-v2.8.zip`** and upload everything into **github.com/gankco-energy/gankco-nest**, then commit. Keep the `CNAME` file.
4. Reload Nest (**Ctrl + Shift + R**).
5. **Check, as the Super Admin:**
   - **Nest admin → Team & access:** the new **Apps** column. Everyone keeps the apps they had; untick **Inventory** or **Purchase Order** for anyone who shouldn't use it.
   - **Nest admin → Nest settings → Company details:** the company name and both addresses (they moved here from PO settings).
   - **My account → Adjust size and position** for your signature.
6. Press **End maintenance**.

### What's new in 2.8

**Nest admin and app access**
- **Nest admin** (button on the Nest home screen, and at the bottom of every app's menu): Team & access, Audit log, and **Nest settings** (company details, alert emails, maintenance, backups).
- **Each app has its own settings:** **Inventory settings** (count dates, warnings, form details) in Inventory, **PO settings** (numbering, service lines) in the Purchase Order app.
- **Apps per person:** tick **Inventory** and/or **Purchase Order** on the Team page, and when approving a new sign-up. The database enforces it: without Inventory, a person can't open it or read its data, even by typing the address. In the PO app they can still pick Inventory items onto a PO (code, name and unit only). Management only sees the apps they're ticked for. Alert emails leave out apps a person doesn't have.

**Purchase orders**
- **Required before Sign & issue:** service line, sub service line, supplier name, phone and address (marked with a red asterisk). Drafts can still be saved incomplete.
- **Phone and Fax** are separate boxes (on the PO and in Suppliers). The PO prints `: 713-433-2277      Fax: 713-433-2443`. The saved suppliers were cleaned up.
- **Lines:** drag the ⋮⋮ handle to move a line or heading; **Remove** on every row; ↑ ↓ still work on phones.
- **Several supplier quotes on one PO:** choose them together in **Read a supplier quote**. Their lines are added to the same PO, every file is kept, and all the quote numbers go into the quote ref. Tick **Put each quote's lines under its own heading** only if you want headings.
- **The PO documents now match the company's POs:** S.No. runs on across headings, dates print as 18/08/2025, totals as USD 172,863.65, the amount in words reads "…Dollars, Sixty Five Cents", only the signature sits on "Signed" (no name or title), and the PDF shows when it was generated at the top left and the page (1/2) at the bottom right.
- **File names:** *Purchase Order GES-WI-PO-10038-2026 Thru Tubing Systems Inc QN 092624-01JH, 030325-01JH* (drafts say DRAFT).
- **Delete drafts** from the PO list: the bin on each draft, or tick several and delete them together. Deleting is complete (lines and files too) and uses no number; the Audit log keeps one line.
- **Statuses:** Draft, Issued, Partly received, Fully received, **Closed**, Cancelled, plus a **Late** filter. **Close PO** (with a reason) when nothing more will come; it clears On order.
- **Deliveries:** the person who raised a PO gets a bell alert when goods are received; the daily email lists POs past their delivery date with nothing received; the **Overview** shows late and due-this-week deliveries; lines that aren't Inventory items (services, crating) can be marked received by the person who raised the PO.
- **Revisions:** Nest lists what changed (lines added or removed, quantity and price changes, total before and after) and sends it to the Super Admin, the raiser and the people who receive that line's goods. **Compare versions** shows any two versions side by side.
- **Add old POs in bulk:** choose up to 20 PDFs or Excel files (8 MB each). Nest reads the PO number, date, supplier, total and lines from each; check the table and add them. Each original file is kept with its PO.
- **Overview** (first page of the PO app): spend by month, service line, sub service line and supplier, each currency on its own; and **Items bought most**, with last, lowest and highest price, to spot price rises and items worth buying in bulk.

**Signatures**
- Blank edges and stray marks around every signature are trimmed automatically.
- **My account → Adjust size and position:** make your signature bigger or smaller and move it up or down, with a preview. It applies on every document Nest signs for you.

---

# Earlier: version 2.7 update

## Install 2.7 (about 10 minutes)

1. **Lock Nest:** **Settings → Maintenance → Schedule maintenance → All of Nest → Start now**.
2. **Supabase → SQL Editor → New query:** paste all of **`10-nest-v2.7-upgrade.sql`** and press **Run**. It should end with **Nest 2.7 installed**. It's safe to run again.
3. **GitHub:** unzip **`gankco-nest-v2.7.zip`** and upload everything into **github.com/gankco-energy/gankco-nest**, then commit. Keep the `CNAME` file.
4. Reload Nest (**Ctrl + Shift + R**). On the Nest home screen, the **Purchase Order** tile is now live.
5. **Check, as the Super Admin:**
   - **Purchase Order → PO settings:** the company name, both office addresses, and **Next PO number: 10038**.
   - **Team:** the new **Purchase Order** column. Everyone is switched on at first; switch it off for anyone who shouldn't raise POs.
   - **Team → Who can receive PO deliveries:** switch it on for any storekeeper.
6. **Raise one test PO**, then press **End maintenance**. (If you don't want to keep the test PO, cancel it: its number is never reused. Or keep it as a draft and delete it, which uses no number.)

### What's new in 2.7

**Purchase Order app**

- **Raise a PO:** pick the service line and sub service line, then the supplier. A saved supplier fills in its address and phone; a new one is saved the first time it's issued.
- **The PO sheet has every field of your Excel PO:** Name, Address, Phone, PAN, GSTIN, P.O. date, P.O. number, delivery date, the lines (S.No., part number, item name, HSN/SAC, qty, UOM, rate, amount), totals, amount in words, note, GST tax summary, terms, and the signature. Blank fields print empty, as on the sample. **Deliver To** is a new line under GSTIN: Abuja office, Port Harcourt office, or blank.
- **Currency:** USD, NGN, GBP or EUR, with the amount in words in that currency.
- **Tax isn't worked out:** type the tax amount if the supplier charges it. Nest adds up the lines and adds the tax you typed.
- **Section headings** (A, B, C…) like the SHO Assy & RBP PO, with lines numbered 1, 2, 3 under each.
- **Lines can come from:** typing, **Pick from Inventory** (part number, name and unit fill in), **Read a supplier quote** (Excel or a PDF with selectable text), **Paste from an AI chat** (free: works with any quote, including scans), or the **Job planner's Ship-in list** (**Create purchase order**). They can be mixed. The quote file is kept with the PO.
- **Terms:** optional, one per line. Terms used before can be picked again.
- **Sign & issue:** the raiser's signature is the approval. The number is given at that moment: **GES-WI-PO-10038-2026**, one running number for every line (WI, WEO, PEO, WHS) that carries on across years. The Super Admin gets a bell notification for every issued PO.
- **PDF and Excel copies:** the Excel is built cell for cell from your Sand Screens sheet; the PDF has the same layout.
- **Revise:** keeps the number and adds **-R1, -R2**, with a short reason, signed again. Every earlier version is kept, marked Superseded, and can be downloaded again exactly as it was signed.
- **Cancel** with a reason (only before anything is received). Issued POs can't be deleted; drafts can.
- **Receive goods:** the Inventory line's admin (or staff they allow) records deliveries against the PO. Linked items go into stock at the chosen location and their price updates from the PO. Status goes Issued → Partly received → Received. Linked items show **On order** until the goods arrive.
- **PO history:** search and filter by service line, sub line, supplier, year, status and currency, with totals per currency and an Excel export.
- **Add an old PO:** for POs sent before Nest, with the original file attached.
- **Suppliers** page to correct details, and **PO settings** for the company name, addresses and next number (Super Admin).
- **Leaving the PO sheet** with unsaved changes saves the draft quietly.
- Works with the maintenance lock (**Purchase Order** on its own, or all of Nest), the Audit log and backups.

**Smaller items**

- **Sign-in page:** shows a notice when Nest is under maintenance, or about to be.
- **Settings → Alert emails → Recent emails:** when Brevo refuses an email, its reason is shown with a hint (for example, a wrong API key or blocked IP addresses).
- **Audit log is live:** new changes appear as they happen, with a **Live** dot. If the tab was in the background, it catches up when you come back.
- **Job planner:** "Left after jobs" is now **Complete BHAs after all upcoming jobs** ("After every active job on the list takes its parts"), and "Above / (below) target" is now **Compared with safety target**, on the Summary tab, the PDF and the Excel.
- **Inventory:** tick items and press **Archive** (or **Restore** on the Archived filter). **Delete** removes items added by mistake that were never used; anything used in Nest has to be archived instead, and Nest says what it was used in.

---

# Earlier: version 2.6.2 update

## Install 2.6.2 (about 5 minutes)

1. **Lock Nest:** **Settings → Maintenance → Schedule maintenance → Inventory → Start now** (the Job planner is part of Inventory).
2. **Supabase → SQL Editor → New query:** paste all of **`9-nest-v2.6.2-upgrade.sql`** and press **Run**. It should end with **Nest 2.6.2 installed**. It's safe to run again.
3. **GitHub:** unzip **`gankco-nest-v2.6.2.zip`** and upload everything into **github.com/gankco-energy/gankco-nest**, then commit. Keep the `CNAME` file.
4. Reload Nest, open **Job planner → Setup** and check the two extension rods (below). Then press **End maintenance**.

### What's new in 2.6.2: the Job planner follows the Excel tracker exactly

- **Complete BHAs on the shelf** uses the Excel's rules. *Limited by* lists the parts below the safety target and the 10 ft blanks short of the packers, or **None**.
- New columns: **Left after jobs** and **Above / (below) target**, as in the Excel's safety stock section.
- A line under the table shows the **total** for the sizes that share 10 ft blanks (2-3/8" and 2-7/8"), so the two sizes aren't added together by mistake.
- The **Jobs short** tile also shows the Excel's **shortfall cells**.
- The extension rod is split into the Excel's two rods:
  - **Extension Rod TTS (2-3/8"–3-1/2") + EMST (2-7/8"–3-1/2")**: one shared set, needed once. It's needed on 2-3/8" for TTS jobs only, and on 2-7/8" and 3-1/2" for any job. It's not needed on 4-1/2".
  - **Extension Rod 2-3/8" EMST**: needed on 2-3/8" EMST jobs only.
  - The SQL links the first to **GES-TT-RT-5011-238-A-075** and the second to **GES-TT-RT-FAB-EXT-001**. Swap them on **Setup** if that's the wrong way round.
- On **Setup**, a service tool's cell now has **"Needed for this size when the job uses"**. Use it to make a tool apply to TTS jobs only or EMST jobs only, for one size.
- The management report (PDF and Excel) has the same columns and the shared-blanks line.
- **Inventory:** an item with nothing left shows **None left** instead of **Low**.

**Checked against the Excel:** Nest was loaded with the Excel's stock count and its 8 jobs. It matched every result the Excel shows (37 checks):
- complete BHAs 2 / 2 / 1 / 0, with the same *Limited by* text;
- 11 shortfall cells and 20 units for jobs;
- every surplus/shortfall cell and every job's stock check;
- left after jobs, above/below target, safety top-ups and EMST backups;
- 51 units to ship in total.

---

# Earlier: version 2.6 update

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
