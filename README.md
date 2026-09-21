# doublequilt.github.io

Personal website for GitHub Pages.

The design is intentionally lightweight and link-first: a narrow reading column, a friendly homepage directory, serif display typography, restrained color, automatic dark mode, and subtle texture. It takes broad visual inspiration from austegard.com while using original markup, CSS, content, and decoration.

## Stack

- Plain HTML
- Plain CSS
- Tiny vanilla JavaScript helper for the footer year
- No framework
- No build step

## Local preview

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

This repository is named `doublequilt.github.io`, so it can serve as the account's GitHub Pages user site.

In GitHub:

**Settings → Pages → Build and deployment → Deploy from a branch → main → / (root)**

## Custom domain

The same static files can be used with a custom domain later.

1. Add the custom domain in GitHub Pages settings.
2. Copy `CNAME.example` to a file named `CNAME`.
3. Put only the domain name in `CNAME`.
4. Configure DNS according to GitHub Pages' current instructions.
5. Enable HTTPS once DNS resolves.
