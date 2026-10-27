# START HERE: swap in the clean project, then follow the checklist

## Part 1: Replace the old files with the new ones (10 minutes, no mistakes possible if you follow this)

You will DELETE three folders and PASTE three new ones. You will NOT touch anything else.

**Never touch these (they are yours):** `node_modules`, `package.json`, `package-lock.json`, `.env`, `tsconfig.json`.

1. In the Kiro terminal press **Ctrl + C** to stop the server (if it is running).
2. Open File Explorer and go to `C:\Users\HP\Desktop\allowance` (the folder with `package.json` in it).
3. Find the zip you downloaded (`allowance-final-v18.zip`). Right-click it, choose **Extract All**, then **Extract**.
   Open the extracted folder, then open the folder inside it called `allowance`.
4. In your project folder, **delete** these three folders: `src`, `docs`, `web`.
   (Right-click, Delete. They are all inside the new zip, so nothing is lost.)
5. From the extracted `allowance` folder, **copy** these into your project folder (Ctrl+C, then Ctrl+V):
   - the three folders: `src`, `docs`, `web`
   - the folder `.github` (a folder whose name starts with a dot; if you cannot see it, click View, then Show, then Hidden items)
   - the two files: `README.md` and `render.yaml`
   If Windows asks "Replace files?", choose **Replace the files in the destination** for README.md and render.yaml only.
6. Add ONE line to the `"scripts"` part of your `package.json` ONLY IF it is not there already. Check that these exist:
   `typecheck`, `test`, `dev`, `dev:live`, `smoke`, `smoke:live`, `proxy`. They should already be there from before.
7. In the terminal, run these three commands, one at a time:
   ```
   npm test
   npm run typecheck
   npm run dev
   ```
   Expect: **128 tests passed**, then no output from typecheck, then "Allowance dashboard (DEMO mode)".
8. Open http://127.0.0.1:8787/ in Chrome and press **Ctrl + F5**. You should see a dark page with the headline "Let AI agents handle money. Without handing them the keys.", an animated diagram on the right (little glowing dots sliding toward a shield), and four numbered steps under the buttons. Press the small sun/moon button at the top to switch between dark and light.

If anything fails, copy the red text and send it to me.

## Part 2: The checklist to the finish line (do in this order)

| # | Job | Guide | Done when |
|---|---|---|---|
| 1 | Swap in the clean project | this file, Part 1 | 128 tests pass |
| 2 | Put the code on GitHub (public) | `GITHUB.md` | repo is public, no `.env` inside, license shows |
| 3 | Put the demo online on Render | `DEPLOY.md` | `<your-url>/api/health` shows `{"ok":true}` |
| 4 | Make the thumbnail | `THUMBNAIL_PROMPT.md` | 1280x720 image saved |
| 5 | Record the video | `DEMO_GUIDE.md` | 2:40 or less, public on YouTube |
| 6 | Fill in Devpost | `SUBMISSION.md` | all links pasted, submitted |

**Target: submit by Nov 10.** The hard deadline is Nov 12 at 9:00pm GMT+1. Submitting early leaves room for surprises.

## Part 3: Other files in this folder
- `IMPACT.md`: how Allowance helps businesses, ventures and people, plus a 30-second pitch and answers to judge questions.
- `ARCHITECTURE.md`: how it works and the answers to give if a judge asks "how do you know it is safe?"
- `JUDGING_MAP.md`: the judging criteria and prizes, and exactly which feature answers each one.
- `TOOL_MAP.md`: which PayPal tools move money.
- `SANDBOX_DATA.md`: your sandbox capture IDs.
