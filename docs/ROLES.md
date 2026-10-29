# Users, roles and secure sign-in

## Roles

The system administrator has every permission and is the only role that manages user accounts.
The five other roles cover the school's main jobs:

| Role | Who | Can | Cannot |
|---|---|---|---|
| **System administrator** (`admin`) | IT / head of administration | Everything, including creating users and assigning roles | — |
| **Principal** (`principal`) | Head of school, deputy | Read every module; manage academic years, classes, courses and assignments; approve or reject instalment plans; financial reports | Record or void money, edit students, enter grades |
| **Registrar** (`registrar`) | Admissions / school office | Create and edit students and guardians; register students; request instalment plans; read tuition accounts, grades, teachers | Take payments, approve plans, see expenses or reports |
| **Bursar** (`bursar`) | Finance manager | Payments, voids, plans (request and approve), item catalog and stock, sales, expenses, financial reports | Edit students, registrations or academics; see salaries |
| **Cashier** (`cashier`) | Front desk | Record tuition payments and sales; read accounts and the catalog | Void anything, see expenses or reports, approve plans |
| **Teacher** (`teacher`) | Teaching staff | Read students, classes and results; enter grades **only for the courses assigned to them** | Anything financial, registrations, staff data |

The full permission matrix is in the app (Users & roles → Roles & permissions) and in
`backend/src/modules/auth/roles.js`. Roles live in code, not in the database, so every change is reviewed.

How it is enforced:
- **Server side, on every request.** `middleware/auth.js` has one access table (method + path → permission).
  A request that matches no rule is refused: *deny by default*. A teacher's grade entry is also checked row by row
  (`class_courses.teacher_id`).
- **Client side, for comfort only.** The menu, pages and buttons a role can't use are hidden (`useAuth().can()`).
  Hiding is not security: the API refuses anyway.
- Payments, sales and expenses record the signed-in user's name (`received_by`), not a value typed in the form.

## Sign-in: password + one-time code (MFA)

1. **Username + password** → the server checks the password (scrypt hash) and answers with a short-lived *challenge*.
   Unknown user and wrong password give the same message and take the same time (no account enumeration).
2. **6-digit code**, by the method set on the account:
   - **Authenticator app** (TOTP, RFC 6238): Google / Microsoft Authenticator, Authy. The first sign-in shows a
     QR code; the secret is stored encrypted (AES-256-GCM with `APP_SECRET`). A code can be used only once.
   - **Email** (SMTP) or **SMS** (Twilio or Africa's Talking): a random code valid 5 minutes, stored as an HMAC.
     A new code can be requested after 30 s.
3. Success → a **session cookie** `sd_session`: random 256-bit token (only its SHA-256 hash is in the database),
   `HttpOnly` (JavaScript can't read it), `Secure` (HTTPS only), `SameSite=Strict` (not sent from other sites).
   It ends after 30 min without activity or 12 h in all (`SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS`).

Protections:
- 5 wrong passwords **or codes** in a row lock the account for 15 minutes (admin can unlock). Wrong codes count too,
  otherwise someone who knows the password could keep guessing codes.
- Rate limit on `/api/auth/*`: 20 attempts per 5 minutes per IP.
- New accounts and reset passwords get a temporary password, shown once to the admin; the user must change it
  at first sign-in (10+ characters, letters and digits). Changing it signs out the other devices.
- Deactivating a user or changing their role ends their sessions immediately.
- The last active administrator can't be demoted, deactivated or deleted.
- Every sign-in, failure, lockout and account change goes to the security log (Users & roles → Security log).

Configure delivery in `backend/.env` (`SMTP_*`, `SMS_PROVIDER` + keys). Without it, development prints codes in the
API console and production refuses to send (503).

## Secure connection (HTTPS)

All traffic between the browser and the API is encrypted with TLS:

- **Development:** `npm run dev-cert` (backend) creates `certs/localhost.pem`. Vite serves https://localhost:5173 and
  proxies `/api` to the API on https://localhost:3000, verifying its certificate (no `rejectUnauthorized: false`).
  For a certificate the browser trusts without a warning, use [mkcert](https://github.com/FiloSottile/mkcert)
  (command in `backend/scripts/dev-cert.js`).
- **Production:** put the API and the built frontend behind a reverse proxy that gets a free Let's Encrypt
  certificate. With Caddy:

  ```
  school.example.cm {
    encode gzip
    handle /api/* {
      reverse_proxy 127.0.0.1:3000
    }
    handle {
      root * /var/www/schooldoc/frontend/dist
      try_files {path} /index.html
      file_server
    }
  }
  ```

  and in `backend/.env`: `TRUST_PROXY=1`, `REQUIRE_HTTPS=true`, `CORS_ORIGIN=https://school.example.cm`,
  `NODE_ENV=production`, `HOST=127.0.0.1`, empty `TLS_*`: the API is then reachable only through the proxy.
  Alternatively set `TLS_CERT_FILE` / `TLS_KEY_FILE` and the API serves HTTPS itself (TLS 1.2 minimum).

Other headers and checks (helmet): HSTS (browsers refuse to go back to HTTP for a year), no MIME sniffing, no
framing, `Cache-Control: no-store` on API answers, and state-changing requests from another origin are refused
(CSRF defense on top of `SameSite`).
