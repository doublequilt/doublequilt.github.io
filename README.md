# Personal Website

A lightweight personal site inspired by the simplicity and link-first feel of austegard.com, but with an original layout and styling.

## Customize it

Open `index.html` and replace:

- `Your Name` and `YN`
- `YOUR-USERNAME` in the GitHub/LinkedIn links
- `you@example.com`
- the About text
- the three project cards
- the writing links
- the page title and meta description in `<head>`

You can change the main colors at the top of `styles.css`.

## Run locally

You can double-click `index.html`, or from this folder run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish on GitHub Pages

This repository is already named `doublequilt.github.io`, so it is ready to be used as a GitHub Pages user site.

In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → main → / (root)**.

## Use your own domain

GitHub Pages can host the site while your own domain points to it.

1. In GitHub Pages settings, enter your custom domain.
2. Copy `CNAME.example` to a new file named exactly `CNAME` and replace its contents with your domain.
3. At your domain registrar/DNS provider, follow GitHub's current Pages DNS instructions.
4. After DNS is working, enable **Enforce HTTPS**.

The same files also work on Netlify, Cloudflare Pages, Vercel, or a normal web server because there is no build step.
