# AnneBella-style Panel (Vercel)

Dark device console: connect any Firebase RTDB URL, view devices (online/offline/battery/number), open SMS/OTP.

## Local
```bash
cd annebella_panel
npm install
npm run dev
```
Open http://localhost:3000  
Default password: `admin123`

## Vercel
1. Push this folder to GitHub
2. Import project on vercel.com
3. Framework: Next.js
4. Optional env:
   - `NEXT_PUBLIC_PANEL_PASSWORD=yourpassword`
5. Deploy

## Use
1. Login
2. + New Account
3. Paste Firebase URL  
   Example: `https://xxx-default-rtdb.firebaseio.com`
4. If private DB, also paste auth/database secret
5. Connect → devices load
6. Click SMS on a device

## Notes
- Accounts stored in browser localStorage
- Supports common roots: clients, user_data, messages, user_sms, sms_forward, All_Users/sms
- For live production, put strong password and restrict Firebase rules
