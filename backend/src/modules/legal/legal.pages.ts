const CONTACT = 'https://www.instagram.com/k__ariem';
const wrap = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - X Talk</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6;color:#1b1b1f}h1{font-size:26px}h2{font-size:18px;margin-top:24px}input,button{font-size:16px;padding:10px;margin:6px 0;width:100%;box-sizing:border-box}button{background:#6b4eff;color:#fff;border:0;border-radius:8px}.err{color:#b00020}.ok{color:#0a7a3b}</style></head><body>${body}</body></html>`;

export const PRIVACY_HTML = wrap('Privacy Policy', `
<h1>X Talk Privacy Policy</h1>
<p>Last updated: November 2026. This policy explains how X Talk handles your information when you use our language exchange app.</p>
<h2>Information we collect</h2>
<ul>
<li>Account information, such as your email address and username, or the identity you use to sign in.</li>
<li>Profile information you choose to add, such as name, photo, bio, country, date of birth and languages.</li>
<li>Content you create or send, such as messages, photos, posts, comments and voice room activity.</li>
<li>Purchase and virtual item information, such as coin balance and membership status.</li>
<li>Basic technical information needed to keep your account secure and the service running.</li>
</ul>
<p>We do not collect your precise location.</p>
<h2>How we use information</h2>
<p>To provide and improve the app, show your profile and content to other users according to your privacy settings, keep the community safe, and respond to reports and support requests.</p>
<h2>Sharing</h2>
<p>We do not sell your personal information. We use trusted third-party service providers for hosting and real-time voice, and they process information only to help us run the service. We may share information when the law requires it or to protect people from harm.</p>
<h2>Security</h2>
<p>We use industry-standard safeguards to protect your information. No service can guarantee absolute security.</p>
<h2>Retention and deletion</h2>
<p>You can delete your account in the app (Settings, Account, Delete account) or on the web at <a href="/api/v1/legal/delete-account">our delete-account page</a>. When you delete your account we remove your profile details, posts, comments and related activity and stop showing your messages. We may keep limited records where needed for safety and legal reasons.</p>
<h2>Your choices</h2>
<p>You can control who sees parts of your profile in Settings, and you can block and report other users.</p>
<h2>Children</h2>
<p>X Talk is not intended for children under 13.</p>
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
<p>Enter the email and password of your X Talk account. Your account is deleted right away and cannot be recovered. This removes your profile details, posts and comments and signs you out. See the <a href="/api/v1/legal/privacy">privacy policy</a> for what may be kept.</p>
<form id="f"><input id="e" type="email" placeholder="Email" autocomplete="username" required><input id="p" type="password" placeholder="Password" autocomplete="current-password" required><button type="submit">Permanently delete my account</button></form>
<p id="m"></p>
<p>Signed up with Google, or cannot sign in? Delete inside the app (Settings, Account, Delete account), or message <a href="${CONTACT}">${CONTACT}</a> from the profile that matches your account and ask for deletion.</p>
<script>
document.getElementById('f').addEventListener('submit',async function(ev){ev.preventDefault();var m=document.getElementById('m');m.className='';m.textContent='Working...';
try{var r=await fetch('/api/v1/legal/delete-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('e').value,password:document.getElementById('p').value})});
var j=await r.json().catch(function(){return{}});if(r.ok){m.className='ok';m.textContent='Your account was deleted.';}else{m.className='err';m.textContent=(j&&j.message&&String(j.message))||'Could not delete. Check your email and password.';}}catch(e){m.className='err';m.textContent='Network error.';}});
</script>`);
