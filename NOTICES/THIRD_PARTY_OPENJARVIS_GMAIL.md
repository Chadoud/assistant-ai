# Third-party notice: Gmail OAuth / API patterns

The modules below adapt logic from **OpenJarvis** (Apache License 2.0):

- `backend/gmail_google_oauth.py` — loopback OAuth consent, authorization code exchange, and token refresh (see OpenJarvis `src/openjarvis/connectors/oauth.py`).
- `backend/gmail_api_client.py` — Gmail REST `messages.list` / `messages.get` and MIME body decoding (see OpenJarvis `src/openjarvis/connectors/gmail.py`).

OpenJarvis: <https://github.com/OpenJarvis/OpenJarvis> (or the source tree you used).

The adapted code is rewritten for this product (different module layout, narrowed OAuth scope to Gmail read-only, and integration with EXO job staging).
