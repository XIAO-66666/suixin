/* Sharing is progressive: system sheet -> clipboard -> selectable text. */
function publicShareUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    if (!host.includes('.') && !host.includes(':')) return '';
    if (/(^|\.)(localhost|local|test|invalid)$/.test(host) || host === '::1' || host === '::' || /^(fc|fd|fe80:)/i.test(host)) return '';
    const parts = host.split('.').map(Number);
    if (parts.length === 4 && parts.every(Number.isInteger)) {
      const [a,b] = parts;
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return '';
    }
    if (host.includes(':')) return ''; // Do not accidentally share an internal IPv6 address.
    return url.href;
  } catch { return ''; }
}
let sharing = false;
function showManualShare(content, local) {
  $('#shareCopyText').value = content;
  $('#shareHelp').textContent = local
    ? '当前是本机或内网预览，朋友打不开这里的链接。可以先复制邀请文字；网站上线后会自动附上可访问的链接。'
    : '可以复制下面的内容，粘贴到微信、QQ 或其他聊天中发送。';
  $('#shareCopyStatus').textContent = '也可以直接选中文字，使用复制菜单或 Ctrl+C（Mac 用 ⌘C）。';
  if (!$('#shareDialog').open) $('#shareDialog').showModal();
  $('#shareCopyText').focus(); $('#shareCopyText').select();
}
async function copyShareText(content) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch { /* A denied clipboard permission still allows manual copying. */ }
  return false;
}
async function shareContent({title, text, url = '', copyOnly = false}) {
  if (sharing) return;
  sharing = true;
  const safeUrl = publicShareUrl(url);
  const local = !safeUrl;
  const content = text + (safeUrl ? '\n' + safeUrl : '');
  const payload = {title, text, ...(safeUrl ? {url:safeUrl} : {})};
  try {
    if (!copyOnly && typeof navigator.share === 'function') {
      try {
        if (typeof navigator.canShare !== 'function' || navigator.canShare(payload)) {
          await navigator.share(payload);
          if (local) toast('已调用系统分享，仅发送文字；本机预览链接不会发给朋友。');
          return;
        }
      } catch (error) {
        if (error.name === 'AbortError') return; // Cancel means cancel, not copy.
      }
    }
    if (await copyShareText(content)) {
      toast(local ? '已复制文字。本机链接别人打不开，上线后可分享卡片链接。' : '已复制分享内容，粘贴发给朋友吧 💌');
    } else showManualShare(content, local);
  } finally { sharing = false; }
}
$('#closeShareDialog').onclick = () => $('#shareDialog').close();
$('#copyShareText').onclick = async () => {
  const content = $('#shareCopyText').value;
  if (await copyShareText(content)) {
    $('#shareCopyStatus').textContent = '已复制，可以粘贴到聊天中发送了。';
    return;
  }
  $('#shareCopyText').focus(); $('#shareCopyText').select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* Keep selection available. */ }
  $('#shareCopyStatus').textContent = copied ? '已复制，可以粘贴到聊天中发送了。' : '已选中文字，请长按选择“复制”，或按 Ctrl+C（Mac 用 ⌘C）。';
};
