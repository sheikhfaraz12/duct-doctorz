# Duct Doctorz

Run locally with VS Code Live Server at `/`, `/?city=on`, `/?city=on&loc=ottawa`, or `/?city=ab&loc=edmonton`.

Add a location in `cities.json`. Add a new province to the `vercel.json` rewrite if needed. Replace the files in `assets/frames/` and update `FRAME_COUNT` in `script.js` to match.

Deploy the site to Netlify from GitHub; the root `_redirects` file enables direct location URLs and refreshes. Attach `ductdoctorz.com` in Netlify's domain settings.
