# Privacy policy

This policy explains what personal data stealthdebug.org processes, why, for how long, and what your rights are. It is written to comply with the EU General Data Protection Regulation (GDPR, Regulation (EU) 2016/679) and the Spanish Data Protection Act (Ley Orgánica 3/2018, LOPDGDD).

The short version: you can read the blog without an account and without being tracked. There are no analytics, no advertising and no third-party trackers. If you create an account, the site stores your username, email address and comments, and you can delete all of it yourself at any time.

## Who is responsible for your data

| | |
|---|---|
| **Controller** | Mario García Carbonero |
| **Contact** | contact@stealthdebug.org |
| **Website** | https://stealthdebug.org |

stealthdebug.org is a personal, non-commercial website. There is no data protection officer; write to the address above for anything related to your data.

## What data is processed, why, and on what legal basis

### 1. Visiting the website

Every request to the site passes through Cloudflare and reaches the web server, which records a log line with the **IP address**, date and time, requested page, response status, size, referring page and **browser user agent**.

- **Purpose:** keeping the site secure and available: detecting attacks and abuse, diagnosing errors.
- **Legal basis:** legitimate interest in the security of the site (art. 6.1.f GDPR, recital 49).
- **Retention:** server logs are deleted after **30 days**, unless a specific entry is needed to investigate a security incident, in which case it is kept only until the investigation ends.

To slow down password guessing, the login and sign-up forms count attempts per IP address. These counters exist only in the server's memory and expire after at most one hour.

### 2. Creating an account

When you sign up the site stores your **username**, **email address**, a **password hash** (bcrypt; the password itself is never stored), your role, the date your account was created and last changed, and the **date on which you accepted the terms of use**.

- **Purpose:** letting you log in and comment, and preventing duplicate accounts. The email address is only used to identify your account; the site sends no newsletters or marketing.
- **Legal basis:** performance of the terms of use you accept when signing up (art. 6.1.b GDPR). Keeping the acceptance date is based on legitimate interest in being able to prove it (art. 6.1.f).
- **Retention:** until you delete your account, or until it is removed for breaching the terms of use.

### 3. Comments

Comments are stored with their date and the account that wrote them, and are **shown publicly** next to your **username** (not your email). Public pages may be indexed by search engines and archived by third parties, which is outside the site's control.

- **Purpose:** publishing your contributions to the discussion.
- **Legal basis:** performance of the terms of use (art. 6.1.b GDPR).
- **Retention:** until you delete the comment or your account, or until it is removed for breaching the terms of use.

### 4. Contacting me or reporting a vulnerability

If you write to contact@stealthdebug.org, I process your email address and whatever you include in the message.

- **Purpose:** answering you, handling your request or report.
- **Legal basis:** legitimate interest in answering messages sent to me (art. 6.1.f GDPR); for requests about your rights, compliance with a legal obligation (art. 6.1.c).
- **Retention:** as long as needed to deal with the matter, and afterwards only as long as needed to show how a rights request was handled or to defend against legal claims.

### 5. Your browser's storage

See [Cookies and local storage](#cookies-and-local-storage) below.

The site makes **no automated decisions** and does **no profiling** about you.

## Who else processes data

Your data is **not sold, rented or shared** with anyone for their own purposes. These providers process data **on my behalf**, under data processing agreements, only to provide their service:

| Provider | What they do | Data | Location |
|---|---|---|---|
| **IONOS SE** | Hosts the server (VPS) where the site, database and logs live | All the data described above | Server in Spain (EU) |
| **Cloudflare, Inc.** | Network proxy, encryption (TLS), caching and attack protection in front of the site | IP address and request data of every visit, and the content of the pages and forms sent through it | Global network; company in the USA |
| **Grafana Labs (Grafana Cloud)** | Monitoring of the server's health | Technical metrics only (CPU, memory, disk, network totals, container status). **No visitor or account data** | Germany (EU) |
| **Email provider** | Hosts the mailbox contact@stealthdebug.org | Messages you send | — |

Authorities or courts may receive data only when the law requires it.

### International transfers

- **Cloudflare** is a US company. Transfers are covered by the **EU–US Data Privacy Framework**, in which Cloudflare is certified (European Commission adequacy decision of 10 July 2023), and by the **standard contractual clauses** in its data processing agreement.
- **Grafana Cloud** stores the metrics in Germany (EU). They contain no personal data in any case.

## Cookies and local storage

The site uses **no analytics, advertising or tracking cookies**, and therefore shows no cookie banner. It only uses what is strictly necessary for the service you ask for, which is exempt from consent under art. 22.2 of the Spanish Information Society Services Act (LSSI) and the EU ePrivacy rules:

| Name | Type | Set by | Purpose | Duration |
|---|---|---|---|---|
| `jwt` | Cookie (HttpOnly, Secure, SameSite) | stealthdebug.org | Keeps you logged in after you log in | 1 hour, or until you log out |
| `__cf_bm`, `cf_clearance` | Cookies | Cloudflare | Distinguish people from bots when Cloudflare detects suspicious traffic; only set in those cases | 30 minutes (`__cf_bm`); `cf_clearance` up to a few hours |
| `lang` | Local storage | stealthdebug.org | Remembers the language you chose (English/Spanish) | Until you clear it |
| `stealthdebug:draft:*` | Local storage | stealthdebug.org | Unsaved drafts in the post editor (administrator only) | Until the post is saved or the draft discarded |

Local storage never leaves your browser. You can delete cookies and local storage in your browser's settings at any time; the site still works, you will just be logged out and the language will go back to your browser's.

Fonts, scripts and images are all served from stealthdebug.org itself, so reading the site makes no requests to Google or other third parties.

## How your data is protected

All traffic is encrypted (HTTPS). Passwords are stored as salted bcrypt hashes. The login cookie cannot be read by scripts. Login and sign-up are rate-limited. The server runs every service in an isolated, unprivileged container, and access to it is restricted.

**Backups.** The database (including accounts and comments) is backed up once a week and before each update of the site. The backup is encrypted, stays on the same server in Spain, and only I hold the key that can open it. Only one backup exists at a time: each new one replaces the previous one. So when you delete something, it is gone from the live database straight away and from the backup at the next backup, normally within a week.

If a breach ever affects your data, I will notify the Spanish Data Protection Agency within 72 hours where required, and tell you directly if it is likely to put you at high risk.

## Your rights

You can, at any time and free of charge:

- **Access** your data and get a copy of it.
- **Rectify** it: you can change your username and email yourself on your [account page](/dashboard).
- **Erase** it: the **delete account and comments** button on your [account page](/dashboard) removes your account and every comment you have written, immediately. You can also delete individual comments of yours under each post.
- **Object** to processing based on legitimate interest, such as server logs.
- **Restrict** processing while a request or complaint is being resolved.
- **Port** your data: receive your account data and comments in a structured, machine-readable format (JSON).

To exercise any of these, write to **contact@stealthdebug.org** from the email address of your account, or say which account it is about. I will answer within one month. I may ask for information to confirm the account is yours, and only that.

If you think your data has been mishandled, you can complain to the **Agencia Española de Protección de Datos (AEPD)**, C/ Jorge Juan 6, 28001 Madrid, [www.aepd.es](https://www.aepd.es), or to the data protection authority of the EU country where you live. I would appreciate the chance to fix the problem first, but you don't need to contact me before complaining.

## Minimum age

You must be **at least 14 years old** to create an account (art. 7 LOPDGDD). The site does not knowingly keep data of anyone younger; if you believe a child under 14 has an account, write to me and it will be deleted.

## Changes to this policy

If this policy changes, the date at the top changes too. If a change affects how account data is used, registered users will be told on the site before it applies.
