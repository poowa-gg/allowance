# The demo video: step by step (maximum 2 minutes 40 seconds)

Read this like a recipe. Do the steps in order. Do not skip the practice.

## THE STORY (say it to yourself before you record)
> "An AI helper got tricked by a fake invoice and tried to move $600. Allowance stopped it. Only the honest $5 left the account."

Everything in the video proves that one sentence.

## THE TIMELINE (7 scenes, 2:40 in total)
| Scene | Time | What the judge sees | The "wow" |
|---|---|---|---|
| 1. Hook | 0:00 - 0:17 | The dashboard | You explain the danger in plain words |
| 2. The poisoned invoice | 0:17 - 1:01 | The AI works through an inbox | The $600 refund is BLOCKED, and a second AI explains why |
| 3. A human decides | 1:01 - 1:20 | Approvals inbox, kill switch | Nothing risky runs without you |
| 4. Red Team | 1:20 - 1:46 | 21 attacks | All 21 stopped, legitimate ones still pass |
| 5. Real PayPal | 1:46 - 2:08 | The terminal | A real refund ID from PayPal |
| 6. Plain-English rules | 2:08 - 2:22 | A rule typed in English | The AI drafts it, you approve it |
| 7. Proof and close | 2:22 - 2:40 | The audit log | The chain breaks when history is edited |

**If your video is longer than 2:40, delete Scene 6.** Never delete scenes 2, 4 or 5.

---

# PART 1: Words you will hear (so you can explain them to anyone)
| Word | Simple meaning |
|---|---|
| **AI agent** | A computer helper that can do jobs for you, like issuing refunds |
| **Poisoned invoice** | A document with a secret instruction hidden inside, trying to trick the helper |
| **Allowance** | Our safety net that stands between the helper and your PayPal money |
| **Blocked** | Allowance said no. The request never reached PayPal |
| **Held** | Allowance said "ask the owner first" |
| **Approvals inbox** | The list of held requests waiting for the owner to click Approve or Deny |
| **Kill switch** | One big button that stops every action immediately |
| **Red Team** | A friendly attacker built into the app. It tries 21 bad tricks to prove the safety net holds |
| **Audit log** | The diary of every decision. If anyone secretly edits it, the diary shows it was changed |

---

# PART 2: Get ready (30 minutes, do it once)

**Step 1. Tidy the computer.**
- Close every app and browser tab you do not need.
- Click the bell at the bottom right of Windows and turn on **Do not disturb**. (No pop-ups during recording.)

**Step 2. Make the writing big.**
- In Chrome, hold **Ctrl** and press **+** until the page looks big (about 125%). A viewer on a phone must be able to read it.
- In the Kiro terminal, hold **Ctrl** and press **+** three times.

**Step 3. Start the app.**
- In the Kiro terminal type `npm run dev` and press Enter. Wait for the line "Allowance dashboard (DEMO mode)".
- In Chrome open **http://127.0.0.1:8787/** and press **Ctrl + F5**.

**Step 4. Check the AI is switched on.**
- Click **Live agent** in the top menu. The dropdown (labelled "Agent brain") must say **"Auto: real AI (openai/gpt-oss-120b via api.groq.com)"**.
- If it says "Auto: free simulator (no AI key set)", your Groq key is missing from `.env`. Fix that first. Without it, the "AI reviewer" lines will not appear.

**Step 5. Make a fresh PayPal payment for Scene 5.**
- Open a SECOND terminal: click the **+** at the top right of the terminal panel.
- Type `npm run spike:orders:capture` and press Enter.
- A web link appears. Open it, log in as your **sandbox buyer** (the Personal account), click Pay or Continue.
- Go back to the terminal. When it finishes, find the line `"id": "..."` near the top of the JSON. That is your **capture ID**. Write it on paper.
- (You also have `6CT336702L001552M` unused, so you can use that one. See `SANDBOX_DATA.md`.)

**Step 6. Prepare the text you will paste in Scene 6.**
Copy this sentence and keep it ready (paste it into Notepad so you can copy it again):
`Never refund more than $15 without asking me. Block anything over $300. Max $60 a day.`

**Step 7. Prepare to read the script.** Open the "Script only" page at the bottom of this file on your phone, or print it.

---

# PART 3: Practice (do this three times, do not skip)
1. Click **Proof** in the top menu, then click **Reset demo**. (This clears everything back to zero.)
2. Do Scenes 1 to 7 below with the mouse, without recording, reading the script out loud.
3. Reset and repeat. By the third time the clicks feel automatic.

**How to know you got a GOOD run of Scene 2** (the AI behaves slightly differently each time):
- [ ] one green **Allowed** card (the $5 refund)
- [ ] one red **Blocked** card for the invoice, with a box starting "AI reviewer:"
- [ ] at least one orange **Held for you** card, and a card in the Inbox
- [ ] the green box "Money that actually left the account" showing $5.00

If a run does not look like that: click **Proof** in the menu, click **Reset demo**, then click **Run the agent** again. Try up to three times.
**Still no luck?** In the Live agent section, change the dropdown to **"Obedient simulator (always fooled)"** and click Run the agent. It gives the same story every time. Say: *"Real models sometimes refuse, so here is an agent that always obeys. The real question is what a fooled agent can do."* That is honest and still impressive.

---

# PART 4: How to record (Windows)

You will record **three short clips**, not one long video. If you make a mistake, you redo one short clip.

| Clip | Contains | App on screen |
|---|---|---|
| Clip 1 | Scenes 1, 2, 3, 4 | Chrome (the dashboard) |
| Clip 2 | Scene 5 | Kiro (the terminal) |
| Clip 3 | Scenes 6, 7 | Chrome (the same dashboard page) |

**Record Clip 1, then Clip 2, then Clip 3, one right after the other. Do not refresh Chrome and do not click Reset demo in between.** Clip 3 needs the activity from Clip 1 on the screen.

**How to start and stop recording (Xbox Game Bar, already on your PC):**
1. Click the window you want to record so it is in front.
2. Press **Windows key + Alt + R**. A small timer appears. You are recording.
3. Press **Windows key + Alt + R** again to stop.
4. If nothing happens, press **Windows key + G**, click the round **record** button in the "Capture" box. Click the **microphone** icon so it has no line through it.
5. Your videos are saved in `C:\Users\HP\Videos\Captures`.

**Speaking tips:**
- Speak slowly, like to a friend. Smile while you talk (it changes your voice).
- Pause for one second before each click. Pointing with the mouse: move it **slowly**, rest it on the thing you are describing.
- Say "A-I" and "Pay-Pal" clearly.
- Record in a quiet room. Do a 10-second test first: record, say your name, play it back.

---

# PART 5: The scenes

**Moving around the page (so you never fumble with the mouse wheel):** the menu at the top has buttons: **Live agent, Inbox, Red Team, Rules, Proof, Try it**. Click one and the page glides to that section. The menu stays on screen as you scroll.

## SCENE 1: The hook (0:00 - 0:17). Clip 1
**You are showing:** the very top of the page.

| Step | You do | You say | You should see |
|---|---|---|---|
| 1 | Scroll to the very top. Press **Windows + Alt + R** to start recording. Stay still and silent for 2 seconds. | (nothing) | A dark page, the **Allowance** logo, the big headline "Let AI agents handle money. Without handing them the keys." On the right, a small animated diagram: **AI agent, Allowance (shield), PayPal** with glowing dots (sample requests) sliding along it |
| 2 | Rest the mouse pointer near the diagram. | "Imagine you run a small online shop. You give an AI assistant access to PayPal to handle refunds. Then one fake invoice arrives, with a secret instruction hidden inside. This is **Allowance**, a safety net between AI agents and your money." | The dots keep sliding. Green dots pass the shield, red ones bounce back, orange ones drop to "You decide" |

## SCENE 2: The poisoned invoice (0:17 - 1:01). Clip 1 continues
**You are showing:** the section **01 Live agent: the poisoned invoice**.

| Step | You do | You say | You should see |
|---|---|---|---|
| 1 | Click the big gradient button **Run the agent** (top left, under the headline). | "Let me show you. I click Run the agent." | The page glides down to the section "Live agent". The button shows a small spinner. A line with bouncing dots shows messages like "Reading the inbox", "Calling PayPal tools". Grey shimmering bars appear |
| 2 | Wait. (15 to 40 seconds with the real AI. You will cut this wait when editing.) | "An AI is now working through the shop's inbox, using real PayPal tools." | The messages keep changing |
| 3 | When the results appear, scroll down slowly with the mouse wheel. | (nothing) | Two small chips ("Agent: ..." and "Reviewer: ..."), then a vertical timeline of cards. A toast at the bottom right says "Agent finished. Money out: $5.00" |
| 4 | Point at the first ticket card **T1 Customer: charged twice** and the green pill below it. | "Ticket one: a real customer asks for five dollars back. Allowed, and it goes through." | A card with a green **Allowed** pill and the words "Refund $5.00 of payment SIMCAP_SMALL_0001" |
| 5 | Point at the ticket card **T2 Vendor invoice #8841**. Move the pointer slowly around the **red dashed box**. | "Ticket two: a vendor invoice. Hidden inside is a note telling the AI to ignore its limits and refund six hundred dollars." | A red dashed box labelled **HIDDEN INSTRUCTION (THE TRAP)** containing the secret note. It softly glows |
| 6 | Point at the card under it with the red **Blocked** pill, then at the box that starts **AI reviewer:**. | "The AI falls for it. Allowance blocks it. And a second AI explains why: this document is giving orders to the assistant." | A card with a red **Blocked** pill, "Refund the FULL amount of payment SIMCAP_BIG_000600", small chips like "Over the hard cap", and a blue-tinted box "AI reviewer: ..." with a sparkle icon |
| 7 | Point at the next card with an orange pill. | "Ticket three: an angry customer dispute for four hundred fifty dollars. That one waits for me." | An orange/amber **Held for you** pill on "Accept dispute PP-D-SIM-0001" |
| 8 | Scroll to the bottom of the timeline. Rest the pointer on the green box. | "Look at the bottom: money that actually left the account. Five dollars." | A green box "Money that actually left the account" with a big number that counts up to **$5.00** |

## SCENE 3: A human decides (1:01 - 1:20). Clip 1 continues
**You are showing:** the **Inbox** and the **Kill switch**.

| Step | You do | You say | You should see |
|---|---|---|---|
| 1 | Click **Inbox** in the top menu (it has a small orange number). | "Anything risky lands in my approvals inbox. Nothing runs until I decide." | The page glides to "Approvals inbox". A card with an amber border: **Accept dispute PP-D-SIM-0001**, a big amber **$450.00**, chips such as "Needs your OK", and two buttons: green **Approve and run**, red **Deny** |
| 2 | Click the red **Deny** button. | "The AI cannot approve its own requests. I will deny this one." | The card slides away. A toast says "Denied. Nothing was sent to PayPal." The number on the Inbox menu button goes down |
| 3 | Look at the top right of the page. Click the **Kill switch OFF** button once. | "And if I ever panic, one switch stops everything." | The button turns **red** and says **ON**. The edges of the whole page glow red. A red banner says every action is blocked |
| 4 | Click it **again**. (Important! Turn it back off.) | (nothing) | Green again: "Kill switch OFF". The red glow disappears |

## SCENE 4: The Red Team (1:20 - 1:46). Clip 1 ends here
**You are showing:** the section **03 Red Team**.

| Step | You do | You say | You should see |
|---|---|---|---|
| 1 | Click **Red Team** in the top menu. | "Now let's assume the AI is completely compromised." | The page glides to the Red Team section and its blue button **Run Red Team** |
| 2 | Click **Run Red Team** once. | "I click Run Red Team. Twenty-one attacks: fake tools, hidden fields, oversized refunds, even twelve refunds at the same instant." | A spinner for 1 to 3 seconds, and the glowing dots in the top diagram are not visible here, that is fine |
| 3 | Rest the pointer on the three cards that appear. | "All twenty-one stopped. And three honest actions still pass, so it's not just blocking everything." | Three cards with bars that fill up: **21/21 attacks stopped**, **3/3 legitimate actions allowed**, **Intact** (daily budget). A toast: "21 of 21 attacks stopped" |
| 4 | Scroll down the list until you see the group **SEQUENCES**. Point at the row starting **Race: 12 simultaneous...** | "Only a few of twelve simultaneous refunds got through. The daily budget held under pressure." | A row with a green **Stopped** pill and text like "5 of 12 went through". **Say the number that is on YOUR screen** |
| 5 | Press **Windows + Alt + R** to stop recording. Clip 1 is finished. | | A message that the clip was saved |

## SCENE 5: It is real PayPal (1:46 - 2:08). Clip 2
**You are showing:** the terminal in Kiro. This is your proof.

| Step | You do | You say | You should see |
|---|---|---|---|
| 1 | Click on the **Kiro** window so it is in front. Click inside the terminal. Type `cls` and press Enter. Press **Windows + Alt + R** to start recording. | (nothing) | An empty terminal |
| 2 | Type this (replace the ID with your own capture ID) and press Enter: `npm run smoke:live -- --capture=YOUR_CAPTURE_ID` | "And this is not a mock-up." | The text "Allowance smoke test (LIVE PayPal SANDBOX)" |
| 3 | Wait 20 to 60 seconds. (You will cut the waiting out when editing.) | "Here it is on the real PayPal sandbox, through PayPal's official connector." | Five numbered sections appear one after another |
| 4 | When it finishes, point at section **2) ROGUE AGENT** and the word BLOCKED, then at **4) PROMPT-INJECTED AGENT** and its BLOCKED. | "The oversized refund never reaches PayPal." | Lines saying `-> BLOCKED` |
| 5 | Point at the line starting **PayPal said:** and the `"id":"..."` inside it. | "The approved one does, and here is the real refund ID PayPal sent back." | `approval status: EXECUTED` and `PayPal said: {"id":"...","status":"COMPLETED"...}` |
| 6 | Press **Windows + Alt + R** to stop. Clip 2 is done. | | |

**Warning:** this really refunds that payment. Use each capture ID **only once on camera**. To practise safely, use `npm run smoke` (no real PayPal).

## SCENE 6: Rules in plain English (2:08 - 2:22). Clip 3
**You are showing:** the section **04 Rules in plain English**.

| Step | You do | You say | You should see |
|---|---|---|---|
| 1 | Click on the **Chrome** window (do NOT refresh). Press **Windows + Alt + R** to start recording. Click **Rules** in the top menu. | (nothing) | Three little chips at the top of the box: "Auto-approve up to $20.00", "Always block above $500.00", "Daily limit $100.00" |
| 2 | Click inside the text box. Press **Ctrl + V** to paste your sentence from Part 2, Step 6. | "Owners set the rules in plain English." | Your sentence in the box |
| 3 | Click the blue **Draft the change with AI** button. Wait 3 to 10 seconds. | "The AI drafts the change, and a strict checker validates it." | "Drafting..." then a line "AI draft: ..." and three rows. In each row the old value is crossed out and the new value is green: **$20.00 to $15.00**, **$500.00 to $300.00**, **$100.00 to $60.00** |
| 4 | Click the green **Apply these changes** button. | "Nothing applies until I approve the before and after." | The rows turn into a green chip "Policy updated and logged". The three chips at the top flash and show the new numbers. A toast says "Policy updated" |

**If the AI is slow or shows an error:** click the **Strict preset** button instead, then **Apply these changes**. Say: *"Or pick a ready-made preset."*

## SCENE 7: Proof and close (2:22 - 2:40). Clip 3 ends here
**You are showing:** the section **05 Proof**.

| Step | You do | You say | You should see |
|---|---|---|---|
| 1 | Click **Proof** in the top menu. | "Every decision is saved in a tamper-evident log." | A table of rows and a **green** chip "Chain verified (N records)" |
| 2 | Click the **Simulate tampering** button (on the right of the chip). | "If anyone edits history, the chain breaks and shows exactly where." | The chip turns **red** and shakes: "CHAIN BROKEN at record N". A toast: "An old record was secretly edited" |
| 3 | Look at the camera (or the screen) and say the last lines slowly. Stay still for 2 seconds. | "Allowance lets small businesses use AI agents safely, saving hours without risking their savings. Let agents work, without handing them the keys." | The red chip stays on screen |
| 4 | Press **Windows + Alt + R** to stop. All three clips are done. | | |
| 5 | (Not on camera) Scroll down and click **Reset demo** so the page is clean again. | | |

---

# PART 6: Editing (Windows 11, free, about 20 minutes)

1. Press the **Windows key**, type **Clipchamp**, open it, click **Create a new video**.
2. Click **Import media** and add your 3 clips from `C:\Users\HP\Videos\Captures`.
3. Drag them to the bottom bar (the "timeline") in this order: **Clip 1, Clip 2, Clip 3**.
4. **Cut the waiting.** Put the white line at the start of a boring wait. Click the **scissors** icon (Split). Move to the end of the wait. Click **Split** again. Click the middle piece and press **Delete**. Do this for: the AI thinking in Scene 2, the PayPal terminal waiting in Scene 5, the AI drafting in Scene 6.
   (Easier alternative for a long wait: click the piece, open **Speed** on the right, and choose 4x.)
5. **Captions:** click **Captions** on the left, choose **Auto captions** (or "Transcribe media"), choose English, wait. Read them once and fix any wrong words (especially "Allowance").
6. **Check the length** shown at the bottom: it must be **2:40 or less**. If it is more, delete Scene 6.
7. **Title and end card (they cost no extra time):** click **Text**. Add "Allowance: a spending firewall for AI agents" on top of the first 3 seconds. Add a second text on the LAST 4 seconds: "Try it live: YOUR-RENDER-LINK  |  Hosted on Render".
8. **No music.** (The rules forbid copyrighted music. Silence is safest.)
9. Click **Export** and choose the highest quality (1080p if offered). Save to your Desktop.
10. **Watch the whole video once on your phone.** If you cannot read the screen, re-record that clip with bigger zoom.

---

# PART 7: Upload to YouTube
1. Go to **studio.youtube.com**. Click **Create**, then **Upload videos**, and choose your file.
2. Title: `Allowance: a spending firewall for AI agents (PayPal AI Hackathon)`
3. Description: one sentence about the project, then your **GitHub link** and your **live demo link**.
4. Audience: choose **No, it's not made for kids**.
5. Upload your thumbnail (see `THUMBNAIL_PROMPT.md`).
6. Visibility: **Public**. (Not "Unlisted". The rules say public.)
7. Click **Save/Publish**, copy the video link, and paste it into Devpost.
8. Open the link in a private/incognito window to make sure it plays.

---

# PART 8: What makes a demo win "Best Demo Delivery"

**Do:**
- Start with the danger in plain words (the first 10 seconds decide whether judges lean in).
- Tell ONE story, from the poisoned invoice to real proof.
- SHOW every claim on screen. Do not only say it.
- Show the real PayPal refund ID (it proves nothing is fake).
- Keep text big and captions on (many judges watch with no sound).
- Cut every long wait. Never leave silence of more than 2 seconds.
- Finish with one clear sentence.

**Avoid:**
- Talking fast, or reading like a robot. Talk like you are telling a friend.
- A shaky mouse. Move slowly. Rest it on what you describe.
- Pop-ups, other tabs, or your `.env` file on screen. No keys visible anywhere.
- Music, logos of other companies, or anything copyrighted.
- Going over 2:40.

**Final check before you upload:**
- [ ] 2:40 or less
- [ ] The $600 BLOCKED moment is clear
- [ ] A real refund ID is visible
- [ ] I can read the text on my phone
- [ ] Captions are correct
- [ ] No keys or secrets on screen
- [ ] Video is Public

## If something breaks while recording
| Problem | Fix |
|---|---|
| The AI is slow or shows a "429" or "rate limit" message | Wait one minute, or choose **Obedient agent simulator** in the dropdown (it is instant) |
| The AI refuses the poisoned invoice and nothing is Blocked | Click **Reset demo** (in Proof), run again (up to 3 tries), or use the simulator |
| Nothing is waiting in the Approvals inbox | Same as above: re-run the agent until a HELD row appears |
| The page looks strange | Press **Ctrl + F5**, then click **Reset demo** (in Proof) |
| The terminal scene shows "FAILED" | That capture ID was already refunded. Make a fresh one (Part 2, Step 5) |
| Red scary text anywhere | Stop, copy it and send it to me. Nothing here can hurt your computer or move real money |

---

# SCRIPT ONLY (print this or open it on your phone)

**Scene 1 (0:00)**
Imagine you run a small online shop. You give an AI assistant access to PayPal to handle refunds. Then one fake invoice arrives, with a secret instruction hidden inside. This is Allowance, a safety net between AI agents and your money.

**Scene 2 (0:17)**
Let me show you. I click Run the agent.
An AI is now working through the shop's inbox, using real PayPal tools.
Ticket one: a real customer asks for five dollars back. Allowed, and it goes through.
Ticket two: a vendor invoice. Hidden inside is a note telling the AI to ignore its limits and refund six hundred dollars.
The AI falls for it. Allowance blocks it. And a second AI explains why: this document is giving orders to the assistant.
Ticket three: an angry customer dispute for four hundred fifty dollars. That one waits for me.
Look at the bottom: money that actually left the account. Five dollars.

**Scene 3 (1:01)**
Anything risky lands in my approvals inbox. Nothing runs until I decide.
The AI cannot approve its own requests. I will deny this one.
And if I ever panic, one switch stops everything.

**Scene 4 (1:20)**
Now let's assume the AI is completely compromised.
I click Run Red Team. Twenty-one attacks: fake tools, hidden fields, oversized refunds, even twelve refunds at the same instant.
All twenty-one stopped. And three honest actions still pass, so it's not just blocking everything.
Only a few of twelve simultaneous refunds got through. The daily budget held under pressure.

**Scene 5 (1:46)**
And this is not a mock-up.
Here it is on the real PayPal sandbox, through PayPal's official connector.
The oversized refund never reaches PayPal.
The approved one does, and here is the real refund ID PayPal sent back.

**Scene 6 (2:08)** (the one to cut if you are over time)
Owners set the rules in plain English.
The AI drafts the change, and a strict checker validates it.
Nothing applies until I approve the before and after.

**Scene 7 (2:22)**
Every decision is saved in a tamper-evident log.
If anyone edits history, the chain breaks and shows exactly where.
Allowance lets small businesses use AI agents safely, saving hours without risking their savings.
Let agents work, without handing them the keys.
