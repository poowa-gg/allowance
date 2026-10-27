# Deploy to Render, step by step (and how to aim for "Best Use of Render")

**What you are making:** a public web link (like `https://allowance-demo-xxxx.onrender.com`) that anyone, including judges on their phones,
can open with nothing to install. It runs in DEMO mode (a simulated PayPal), so it is safe to share. Never deploy live mode.

---

## PART 1: Check three things before you start (10 minutes)

**1. Your code is on GitHub** (follow `GITHUB.md` first). Open your repo page in a private window. You must see these files:
`render.yaml`, `package.json`, `package-lock.json`, `src` folder, `web` folder. You must NOT see a file called `.env`.

**2. `tsx` is in your `package.json`.** In the Kiro terminal run `npm ls tsx`. You should see a line with `tsx@` and a version number.
If it says "(empty)", run `npm install -D tsx`, then `git add .`, `git commit -m "add tsx"`, `git push`.

**3. The lock file is in sync.** Run `npm install` once. If `git status` then shows `package-lock.json` as changed, commit and push it:
`git add .`, `git commit -m "update lock file"`, `git push`. (Render installs exactly what the lock file says; if the two disagree, the build fails.)

---

## PART 2: Make your Render account (5 minutes)
1. Go to **render.com** and click **Get Started**.
2. Choose **Sign in with GitHub** (this makes the next step easy).
3. Render's free web service normally does not ask for a card. If it asks for payment details, stop and tell me. I cannot verify
   Render's current sign-up rules from here.

---

## PART 3: Create the service from the Blueprint (10 minutes)
The file `render.yaml` in your project describes the whole service, so Render builds everything from it.

1. In the Render dashboard click the blue **New +** button, then **Blueprint**.
2. Click **Connect GitHub** (or "Configure account"). GitHub asks which repositories Render may see.
   Choose **Only select repositories**, pick **allowance**, and click **Install**.
3. Back in Render, select your **allowance** repository, keep the branch as **main**, and click **Connect**.
4. Render reads `render.yaml` and shows one service: **allowance-demo**. It asks for the value of **GROQ_API_KEY**:
   - paste your Groq key here (this is Render's private secret box, NOT your repo), or
   - leave it empty to run only with the free simulator (the "AI reviewer" and "plain-English rules" need the key).
5. Click **Apply** (or **Deploy Blueprint**).

**If the Blueprint option is confusing, do it by hand instead:** **New +** then **Web Service**, pick your repo, and fill in:
| Field | Value |
|---|---|
| Name | `allowance-demo` |
| Runtime / Language | Node |
| Build Command | `npm ci --include=dev` |
| Start Command | `npx tsx src/app/server.ts` |
| Instance Type | Free |
| Health Check Path | `/api/health` |
| Environment variables | `NODE_VERSION` = `22`, `ALLOWANCE_HOST` = `0.0.0.0`, `ALLOWANCE_MAX_LLM_RUNS_PER_HOUR` = `30`, `GROQ_API_KEY` = your key |

---

## PART 4: Watch it build (3 to 6 minutes)
1. Click your service, then the **Logs** tab.
2. You will see lines scroll by. Near the end you should see **`Allowance dashboard (DEMO mode)`** and then a message that the service is **live**.
3. At the top of the page Render shows your public URL. Click it.

---

## PART 5: Test it (do all of these)
- [ ] Open `<your-url>/api/health`. You should see `{"ok":true,"platform":"render",...}`.
- [ ] Open the main page. At the very bottom the footer should say **"Hosted on Render · build xxxxxxx"**.
- [ ] Click **Run the agent**, then **Run Red Team** (expect 21/21 stopped).
- [ ] **Open the link on your phone.** The page must fit the screen with no sideways scrolling.
- [ ] Open it in two different browsers: each one gets its own private demo, so one cannot disturb the other.

---

## PART 6: Put the link everywhere
- In `README.md`, replace `<paste your Render URL here>` and push to GitHub.
- In Devpost ("Live demo" link), in the YouTube description, and on the last 3 seconds of your video.

---

## PART 7: Keep it awake and updated
- **Free services go to sleep** after a period without visitors. The first visit after sleeping can take about a minute.
  **Open your URL yourself** right before you record the video, right before you submit, and from time to time while judging runs.
- **Updating:** change code, then `git add .`, `git commit -m "what changed"`, `git push`. Render rebuilds automatically (auto-deploy is on).
- **Rolling back:** in the Render dashboard open **Events**, find an older green deploy, and choose **Rollback**.

---

## PART 8: If something goes wrong
| What you see | What to do |
|---|---|
| Build fails with `npm ci` and "package-lock.json" errors | Run `npm install` on your computer, commit `package-lock.json`, push |
| Build fails: `tsx: not found` | Make sure the build command is `npm ci --include=dev` and `tsx` is in `package.json` (Part 1, step 2) |
| "Deploy failed", health check timed out | Open **Logs**. The server must print "Allowance dashboard". Confirm `ALLOWANCE_HOST` is `0.0.0.0` |
| Page loads but "Run the agent" says the AI budget is used up | That is the hourly safety cap working. Choose "Obedient simulator", or raise `ALLOWANCE_MAX_LLM_RUNS_PER_HOUR` |
| The AI features say no AI key | Add `GROQ_API_KEY` under **Environment**, then **Manual Deploy** |
| Anything red you do not understand | Copy it exactly and send it to me |

---

## PART 9: "Best Use of Render": what to show and say
I cannot see how Render's judge scores this, so the plan is to use Render's features properly and make that visible.

**Features already used (all real):**
| Render feature | How Allowance uses it |
|---|---|
| **Blueprint** (`render.yaml`) | The whole service is created from one file in the repo (infrastructure as code) |
| **Web service** | Serves the dashboard and the API |
| **Health check** (`/api/health`) | Render only sends traffic to a healthy instance; the endpoint also reports `platform`, service name and build |
| **Auto-deploy** | Every push to GitHub redeploys |
| **Secret environment variables** | The AI key lives only in Render, never in the repo |
| **Visible integration** | The footer shows "Hosted on Render · build xxxxxxx", read from Render's own environment variables |
| **Safe for public traffic** | Per-visitor private sessions and a shared hourly AI budget |

**Optional extra (only if Render lets you on your plan): a cron job.** Open `render.yaml`, remove the `# ` at the start of the lines in the
commented cron block, push, and Render creates a job that attacks the production build every hour and fails loudly if any attack gets through.
Cron jobs may need a paid plan; if Render asks for payment, skip it. The project works fine without it.

**What to add to Devpost** (also in `SUBMISSION.md`): one short paragraph listing the features above, and 2 or 3 screenshots from your
Render dashboard: the Blueprint/service page, the deploy logs, and the health check passing.
