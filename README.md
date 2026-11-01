# loveistheauthor.com — static copy

A static snapshot of the WordPress site loveistheauthor.com, taken Nov 1, 2026 so the site could leave the old 1000-Buddhas-2025 droplet.

- Made with `wget --mirror --page-requisites --convert-links --adjust-extension` on the droplet, then cleaned up:
  - WordPress shortlinks (`/?p=1234`) now point to the matching page;
  - asset files that had `?ver=` in their names were renamed (`?` → `_`), with references updated;
  - absolute links to loveistheauthor.com were made site-relative.
- The episode list is frozen at the snapshot date. The episodes themselves are hosted on Spotify for Podcasters (anchor.fm), so playback still works, but new episodes won't appear on the site automatically.
- WordPress-only features don't work here: forms, search, comments, and "recommend" hearts.
- Hosted on DigitalOcean App Platform as a static site. Pushing to `main` deploys.
- The original WordPress files and database are archived separately.
