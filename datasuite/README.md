# DataSuite

Internal product dashboard at **https://datasuite.exosites.ch** (PHP 8.4, read-only MariaDB).

## Layout

```
lib/           PHP — Config, Database, Auth, Queries, Funnel (not web-accessible)
web/           Document root — index, login, api/*.php, assets/
src/           Vite UI → npm run build → web/assets/
scripts/       generate-server-env.cjs
```

## Commands

```bash
npm install && npm run build              # from datasuite/
npm run datasuite:generate-env            # from repo root → datasuite/.env.server
UPLOAD_ENV=1 npm run deploy:datasuite     # Web FTP deploy
npm run verify:datasuite
```

Deploy topology: [docs/INFOMANIAK_HOSTING.md](../docs/INFOMANIAK_HOSTING.md)
