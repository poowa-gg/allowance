# Put the project on GitHub (public) WITHOUT leaking secrets
The rules need a PUBLIC repo, with the license visible. Your `.env` holds secrets, so follow every step.

1. Go to github.com and make an account. Click **+**, then **New repository**. Name: `allowance`. Choose **Public**.
   Do NOT tick "Add a README" or "Add license" (the project already has them). Click **Create repository**.
2. In the Kiro terminal run `git --version`. If it says "not recognized", install Git for Windows (git-scm.com), close and reopen Kiro.
3. In the project terminal run these two, one at a time:
   ```
   git init
   git status
   ```
4. **READ THE LIST THAT `git status` PRINTS.** It must NOT contain `.env`, `node_modules` or `data/` (they are ignored on purpose).
   If you see `.env` in the list: **STOP** and tell me. Do not continue.
5. Then run, one at a time (replace YOUR-USERNAME):
   ```
   git add .
   git commit -m "Allowance: a spending firewall for AI agents on PayPal"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/allowance.git
   git push -u origin main
   ```
   A browser window may ask you to sign in to GitHub. If git says "Author identity unknown", run
   `git config --global user.email "you@example.com"` and `git config --global user.name "Your Name"`, then repeat the commit.
6. Open your repo page in a private/incognito window and check:
   - the README shows with a diagram,
   - a `LICENSE` file is listed and the right-hand "About" box says **MIT**,
   - there is NO file called `.env`,
   - the **Actions** tab shows a "CI" run (it runs the tests and the Red Team; a green tick is a nice signal).
7. In the right-hand "About" box click the gear and add a description and topics (`ai-agents`, `paypal`, `mcp`, `security`).
8. If a key was ever committed by mistake: delete that key at the provider (Groq or PayPal), make a new one, and tell me.

Later updates: `git add .`, `git commit -m "describe the change"`, `git push`.
