# Security policy

Found a vulnerability in stealthdebug.org? Thank you for taking the time to report it. This is a personal project, so there is no bug bounty, but every valid report is fixed and, if you want, credited.

## How to report

Email **contact@stealthdebug.org** with the subject **"Security: …"**, in English or Spanish. Please include:

- What the vulnerability is and where (URL, endpoint, parameter).
- Steps to reproduce it, or a proof of concept.
- The impact you think it has.
- Whether and how you would like to be credited.

To send the report encrypted, use my OpenPGP key: [/.well-known/pgp-key.txt](/.well-known/pgp-key.txt), fingerprint `0D5B 0E0A 0B6D BBB2 E4CE  0C3C 6B2C 97DB 7554 E2DD`. Please check the fingerprint before using it.

You can expect:

- An acknowledgement within **7 days**.
- An assessment and, for valid issues, a planned fix within **30 days**. Updates as the fix progresses.
- Coordinated disclosure: please wait until the issue is fixed, or **90 days** after your report, before publishing details. You're welcome to write about it afterwards.

The same information is available in machine-readable form at [/.well-known/security.txt](/.well-known/security.txt).

## Scope

**In scope**

- The website and API at **stealthdebug.org** (`/`, `/api/…`).
- The source code at [github.com/mariogarcia79/stealthdebug](https://github.com/mariogarcia79/stealthdebug), including the deployment configuration.

**Out of scope**

- Cloudflare, IONOS, GitHub, Grafana or other providers' infrastructure. Report those issues to them.
- Denial of service, load testing, or volumetric attacks.
- Social engineering or phishing, and physical attacks.
- Reports from automated scanners without a demonstrated impact, such as missing headers that have no exploitable consequence, version banners, or self-XSS.
- Login, sign-up or SSH brute-forcing.

## Rules for testing

To keep the site and its users safe:

- Use **only your own test accounts**. Don't access, modify or delete other users' data; if you reach any by accident, stop, don't keep a copy, and mention it in your report.
- Don't post comments that other visitors could be harmed by or misled by. Delete your test content when you are done.
- Keep automated requests to a low rate (a few per second at most).
- Don't exploit an issue beyond what is needed to show that it exists.

## Safe harbour

If you act in good faith and follow this policy, I will consider your research authorised, I will not take legal action against you or report you to the authorities for it, and I will work with you to understand and fix the issue. If a third party takes legal action over research done under this policy, I will make it known that it was authorised.

## Acknowledgements

Researchers who have reported valid issues are listed here with their permission.

*No reports yet.*
