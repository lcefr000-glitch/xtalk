const CONTACT = 'https://www.instagram.com/k__ariem';
const wrap = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - X Talk</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6;color:#1b1b1f}h1{font-size:26px}h2{font-size:18px;margin-top:24px}input,button{font-size:16px;padding:10px;margin:6px 0;width:100%;box-sizing:border-box}button{background:#6b4eff;color:#fff;border:0;border-radius:8px}.err{color:#b00020}.ok{color:#0a7a3b}</style></head><body>${body}</body></html>`;

export const PRIVACY_HTML = wrap('Privacy Policy', `
<h1>X Talk Privacy Policy</h1>
<p>Last updated: November 2026. X Talk is a language exchange and social learning app. This page explains what data the app handles.</p>
<h2>Data we collect</h2>
<ul>
<li>Account data: email address, username, password (stored only as a one-way hash), or your Google account identity if you sign in with Google.</li>
<li>Profile data you choose to add: display name, photo, bio, country, date of birth, languages, interests and similar profile fields.</li>
<li>Content you create: chat messages, photos you upload, moments (posts), comments, likes, voice room activity and text chat inside rooms, gifts you send or receive.</li>
<li>Purchase data: coin balance, VIP status and redeem-code history. Payments are not taken inside the app.</li>
<li>Technical data: device and session information for sign-in security (for example IP address and device type), and diagnostic server logs.</li>
</ul>
<p>The app does not collect your GPS location and does not contain advertising or third-party analytics SDKs.</p>
<h2>Voice rooms and calls</h2>
<p>Live audio is sent in real time through our audio provider, LiveKit. Audio is used only to deliver the conversation. We do not store audio recordings.</p>
<h2>How we use data</h2>
<p>To run the app: sign you in, show your profile to other users according to your privacy settings, deliver messages, show moments, run voice rooms and gifts, prevent abuse and respond to reports.</p>
<h2>Sharing</h2>
<p>We do not sell your data. Your profile and content are visible to other users according to your privacy settings. Our hosting provider (Railway) and audio provider (LiveKit) process data for us to run the service. We may act on reports and share information if the law requires it.</p>
<h2>Security</h2>
<p>Data is sent over HTTPS. Passwords are hashed. Sign-in tokens on your phone are stored encrypted. No system is perfectly secure.</p>
<h2>Retention and deletion</h2>
<p>You can delete your account in the app (Settings, Account, Delete account) or from the web: <a href="/api/v1/legal/delete-account">delete-account page</a>. Deleting removes your profile details, posts, comments, likes, follows and notifications, blanks your chat messages, and signs you out everywhere. Reports about you and basic security logs may be kept for a limited time to prevent abuse.</p>
<h2>Your controls</h2>
<p>Settings has privacy options (who sees your country, followers lists, moments and visits) and you can block and report users.</p>
<h2>Children</h2>
<p>X Talk is not for children under 13.</p>
<h2>Contact</h2>
<p>Questions or requests: <a href="${CONTACT}">${CONTACT}</a></p>`);

export const TERMS_HTML = wrap('Terms of Use', `
<h1>X Talk Terms of Use</h1>
<p>By creating an account you agree to these terms.</p>
<h2>Respect others</h2>
<p>Do not post or send content that is illegal, hateful, harassing, threatening, sexually explicit, violent, that targets minors, spam, scams or impersonation. Do not share other people's private information.</p>
<h2>Your content</h2>
<p>You are responsible for what you post, send or say in rooms. You keep your rights, and you allow X Talk to store and show it to the people you share it with.</p>
<h2>Reporting and moderation</h2>
<p>You can report users, messages, moments, comments and voice rooms in the app, and block users. We review reports and may remove content, mute, suspend or delete accounts that break these terms.</p>
<h2>Coins and VIP</h2>
<p>Coins and VIP are virtual items with no cash value. They are not refundable except where the law requires it.</p>
<h2>Accounts</h2>
<p>You must keep your login private. You may delete your account at any time. We may suspend accounts that break these terms.</p>
<h2>Contact</h2>
<p><a href="${CONTACT}">${CONTACT}</a></p>`);

export const DELETE_HTML = wrap('Delete account', `
<h1>Delete your X Talk account</h1>
<p>Enter the email and password of your X Talk account. Your account is deleted right away and cannot be recovered. This removes your profile details, posts, comments, likes, follows and notifications, blanks your messages and signs you out. See the <a href="/api/v1/legal/privacy">privacy policy</a> for what is kept.</p>
<form id="f"><input id="e" type="email" placeholder="Email" autocomplete="username" required><input id="p" type="password" placeholder="Password" autocomplete="current-password" required><button type="submit">Permanently delete my account</button></form>
<p id="m"></p>
<p>Signed up with Google, or cannot sign in? Delete inside the app (Settings, Account, Delete account), or message <a href="${CONTACT}">${CONTACT}</a> from the profile that matches your account and ask for deletion.</p>
<script>
document.getElementById('f').addEventListener('submit',async function(ev){ev.preventDefault();var m=document.getElementById('m');m.className='';m.textContent='Working...';
try{var r=await fetch('/api/v1/legal/delete-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('e').value,password:document.getElementById('p').value})});
var j=await r.json().catch(function(){return{}});if(r.ok){m.className='ok';m.textContent='Your account was deleted.';}else{m.className='err';m.textContent=(j&&j.message&&String(j.message))||'Could not delete. Check your email and password.';}}catch(e){m.className='err';m.textContent='Network error.';}});
</script>`);
