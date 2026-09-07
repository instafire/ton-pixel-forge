'use strict';
/* TON Pixel Forge — app logic */
/* NOTE: no backticks or template literals in this file (deployment constraint) */

var WORKER_BASE = '__WORKER_BASE__';
var NETWORK = 'testnet';
var EXPLORER = NETWORK === 'testnet' ? 'https://testnet.tonviewer.com' : 'https://tonviewer.com';
var GEMS_BASE = NETWORK === 'testnet' ? 'https://testnet.getgems.io' : 'https://getgems.io';

var BUFFER_URL = 'https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm';
var CORE_URL = 'https://cdn.jsdelivr.net/npm/@ton/core@0.63.1/+esm';

/* Compiled TEP-62 contract code (getgems standard, byte-verified against tonweb) */
var COLLECTION_CODE_HEX = 'B5EE9C724102140100021F000114FF00F4A413F4BCF2C80B0102016202030202CD04050201200E0F04E7D10638048ADF000E8698180B8D848ADF07D201800E98FE99FF6A2687D20699FEA6A6A184108349E9CA829405D47141BAF8280E8410854658056B84008646582A802E78B127D010A65B509E58FE59F80E78B64C0207D80701B28B9E382F970C892E000F18112E001718112E001F181181981E0024060708090201200A0B00603502D33F5313BBF2E1925313BA01FA00D43028103459F0068E1201A44343C85005CF1613CB3FCCCCCCC9ED54925F05E200A6357003D4308E378040F4966FA5208E2906A4208100FABE93F2C18FDE81019321A05325BBF2F402FA00D43022544B30F00623BA9302A402DE04926C21E2B3E6303250444313C85005CF1613CB3FCCCCCCC9ED54002C323401FA40304144C85005CF1613CB3FCCCCCCC9ED54003C8E15D4D43010344130C85005CF1613CB3FCCCCCCC9ED54E05F04840FF2F00201200C0D003D45AF0047021F005778018C8CB0558CF165004FA0213CB6B12CCCCC971FB008002D007232CFFE0A33C5B25C083232C044FD003D0032C03260001B3E401D3232C084B281F2FFF2742002012010110025BC82DF6A2687D20699FEA6A6A182DE86A182C40043B8B5D31ED44D0FA40D33FD4D4D43010245F04D0D431D430D071C8CB0701CF16CCC980201201213002FB5DAFDA89A1F481A67FA9A9A860D883A1A61FA61FF480610002DB4F47DA89A1F481A67FA9A9A86028BE09E008E003E00B01A500C6E';
var ITEM_CODE_HEX = 'B5EE9C7241020D010001D0000114FF00F4A413F4BCF2C80B0102016202030202CE04050009A11F9FE00502012006070201200B0C02D70C8871C02497C0F83434C0C05C6C2497C0F83E903E900C7E800C5C75C87E800C7E800C3C00812CE3850C1B088D148CB1C17CB865407E90350C0408FC00F801B4C7F4CFE08417F30F45148C2EA3A1CC840DD78C9004F80C0D0D0D4D60840BF2C9A884AEB8C097C12103FCBC20080900113E910C1C2EBCB8536001F65135C705F2E191FA4021F001FA40D20031FA00820AFAF0801BA121945315A0A1DE22D70B01C300209206A19136E220C2FFF2E192218E3E821005138D91C85009CF16500BCF16712449145446A0708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB00104794102A375BE20A00727082108B77173505C8CBFF5004CF1610248040708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB000082028E3526F0018210D53276DB103744006D71708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB0093303234E25502F003003B3B513434CFFE900835D27080269FC07E90350C04090408F80C1C165B5B60001D00F232CFD633C58073C5B3327B5520BF75041B';

function $(id) { return document.getElementById(id); }

var tonConnectUI = null;
var coreLib = null;
var currentTraits = null;
var locked = {};
var previewTimer = null;
var previewFrame = 0;
var generatedSet = [];
var selectedItems = {};
var collections = [];

var LS_KEY = 'forge_collections_v1';

/* ---------------- helpers ---------------- */

function toast(msg, kind) {
  var zone = $('toast-zone');
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  zone.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 7000);
}

function setStatus(msg, cls) {
  var el = $('mint-status');
  el.textContent = msg || '';
  el.className = 'mint-status' + (cls ? ' ' + cls : '');
}

function randId() {
  var s = '';
  var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (var i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function bytesToB64(bytes) {
  var bin = '';
  var chunk = 0x8000;
  for (var i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function clampNum(v, lo, hi) {
  var n = parseFloat(v);
  if (isNaN(n)) n = lo;
  return Math.max(lo, Math.min(hi, n));
}

function clampInt(v, lo, hi, dflt) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = dflt;
  return Math.max(lo, Math.min(hi, n));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function link(url, label) {
  return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
}

async function ensureCore() {
  if (coreLib) return coreLib;
  if (!window.Buffer) {
    var m = await import(BUFFER_URL);
    window.Buffer = m.Buffer;
  }
  if (window.TON_CORE) { coreLib = window.TON_CORE; return coreLib; }
  coreLib = await import(CORE_URL);
  return coreLib;
}

/* ---------------- contract cell builders ---------------- */

function codeCellOf(hex) {
  return coreLib.Cell.fromBoc(window.Buffer.from(hex, 'hex'))[0];
}

function itemContentCell(owner, index) {
  return coreLib.beginCell().storeAddress(owner)
    .storeRef(coreLib.beginCell().storeBuffer(window.Buffer.from(index + '.json', 'utf8')).endCell())
    .endCell();
}

function buildCollectionCells(owner, collId, royaltyPct) {
  var metaUri = WORKER_BASE + '/meta/' + collId + '/collection.json';
  var baseUri = WORKER_BASE + '/meta/' + collId + '/';
  var contentCell = coreLib.beginCell()
    .storeRef(coreLib.beginCell().storeUint(1, 8).storeBuffer(window.Buffer.from(metaUri, 'utf8')).endCell())
    .storeRef(coreLib.beginCell().storeBuffer(window.Buffer.from(baseUri, 'utf8')).endCell())
    .endCell();
  var royaltyCell = coreLib.beginCell()
    .storeUint(Math.round(royaltyPct * 10), 16)
    .storeUint(1000, 16)
    .storeAddress(owner)
    .endCell();
  var data = coreLib.beginCell()
    .storeAddress(owner)
    .storeUint(0, 64)
    .storeRef(contentCell)
    .storeRef(codeCellOf(ITEM_CODE_HEX))
    .storeRef(royaltyCell)
    .endCell();
  return { code: codeCellOf(COLLECTION_CODE_HEX), data: data };
}

function stateInitB64(code, data) {
  return coreLib.beginCell().store(coreLib.storeStateInit({ code: code, data: data })).endCell().toBoc().toString('base64');
}

function addressOf(code, data) {
  return coreLib.contractAddress(0, { code: code, data: data });
}

function nftItemAddress(collAddrStr, index) {
  var data = coreLib.beginCell().storeUint(index, 64)
    .storeAddress(coreLib.Address.parse(collAddrStr)).endCell();
  return coreLib.contractAddress(0, { code: codeCellOf(ITEM_CODE_HEX), data: data });
}

function mintBodyCell(owner, index, amountNano) {
  return coreLib.beginCell().storeUint(1, 32).storeUint(0, 64)
    .storeUint(index, 64).storeCoins(amountNano)
    .storeRef(itemContentCell(owner, index)).endCell();
}

function batchBodyCell(owner, indexes, amountNano) {
  var val = {
    serialize: function (src, builder) { builder.storeCoins(src.amount); builder.storeRef(src.content); },
    parse: function () { throw new Error('unsupported'); }
  };
  var dict = coreLib.Dictionary.empty(coreLib.Dictionary.Keys.Uint(64), val);
  for (var k = 0; k < indexes.length; k++) {
    dict.set(indexes[k], { amount: amountNano, content: itemContentCell(owner, indexes[k]) });
  }
  return coreLib.beginCell().storeUint(2, 32).storeUint(0, 64).storeDict(dict).endCell();
}

async function sendTx(messages) {
  return tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: messages
  });
}

/* ---------------- collections registry ---------------- */

function loadCollections() {
  try { collections = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch (e) { collections = []; }
  refreshSelects();
}

function saveCollections() {
  localStorage.setItem(LS_KEY, JSON.stringify(collections));
  refreshSelects();
}

function getColl(id) {
  for (var i = 0; i < collections.length; i++) if (collections[i].id === id) return collections[i];
  return null;
}

function refreshSelects() {
  var sels = [$('mint-collection'), $('mint-collection-2')];
  for (var s = 0; s < sels.length; s++) {
    var sel = sels[s];
    if (!sel) continue;
    var cur = sel.value;
    var opts = '<option value="">— new collection —</option>';
    for (var i = 0; i < collections.length; i++) {
      var c = collections[i];
      opts += '<option value="' + c.id + '">' + escapeHtml(c.name) + ' · ' + c.address.slice(0, 10) + '…</option>';
    }
    sel.innerHTML = opts;
    sel.value = cur;
    if (sel.value !== cur) sel.value = '';
  }
}

/* ---------------- wallet ---------------- */

function initWallet() {
  if (typeof TON_CONNECT_UI === 'undefined') {
    toast('Wallet library failed to load — check your connection', 'err');
    return;
  }
  tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: WORKER_BASE + '/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button'
  });
  tonConnectUI.onStatusChange(function (wallet) {
    var badge = $('network-badge');
    if (wallet) {
      var a = tonConnectUI.account.address;
      badge.textContent = (NETWORK === 'testnet' ? 'TESTNET · ' : 'MAINNET · ') + a.slice(0, 4) + '…' + a.slice(-4);
    } else {
      badge.textContent = NETWORK === 'testnet' ? 'TESTNET' : 'MAINNET';
    }
  });
}

/* ---------------- tabs ---------------- */

function initTabs() {
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () {
      var name = this.getAttribute('data-tab');
      var all = document.querySelectorAll('.tab');
      for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
      this.classList.add('active');
      var panes = document.querySelectorAll('.tabpane');
      for (var k = 0; k < panes.length; k++) panes[k].classList.remove('active');
      $('tab-' + name).classList.add('active');
    });
  }
}

/* ---------------- traits + preview ---------------- */

var TRAIT_KEYS = ['item', 'backdrop', 'model', 'symbol', 'anim', 'effect'];
var TRAIT_LABELS = { item: 'Item', backdrop: 'Backdrop', model: 'Model', symbol: 'Symbol', anim: 'Animation', effect: 'Effect' };

function traitDisplay(key, val) {
  if (key === 'item') return art.ITEMS[val].name;
  if (key === 'backdrop') return art.BACKDROPS[val].name;
  if (key === 'model') return art.MODELS[val].name;
  if (key === 'symbol') return art.SYMBOLS[val].name;
  if (key === 'anim') return art.ANIMS[val].name;
  if (key === 'effect') return art.EFFECTS[val].name;
  return val;
}

function renderTraits() {
  var grid = $('traits-grid');
  var html = '';
  for (var i = 0; i < TRAIT_KEYS.length; i++) {
    var key = TRAIT_KEYS[i];
    var val = currentTraits[key];
    html += '<div class="trait-card' + (locked[key] ? ' locked' : '') + '" data-key="' + key + '">' +
      '<div class="t-key">' + TRAIT_LABELS[key] + '</div>' +
      '<div class="t-val">' + escapeHtml(traitDisplay(key, val)) + '</div></div>';
  }
  grid.innerHTML = html;
  var cards = grid.querySelectorAll('.trait-card');
  for (var j = 0; j < cards.length; j++) {
    cards[j].addEventListener('click', function () {
      var k = this.getAttribute('data-key');
      if (locked[k]) delete locked[k]; else locked[k] = currentTraits[k];
      renderTraits();
    });
  }
}

function reroll() {
  currentTraits = art.randomTraits(locked);
  updateArtMeta();
  renderTraits();
}

function updateArtMeta() {
  $('art-name').textContent = art.traitName(currentTraits);
  var r = art.rarityOf(currentTraits);
  var el = $('art-rarity');
  el.textContent = r.tier.toUpperCase() + ' · score ' + art.rarityScore(currentTraits);
  el.style.color = r.color;
}

function startPreview() {
  stopPreview();
  var canvas = $('preview-canvas');
  var ctx = canvas.getContext('2d');
  var frame = 0;
  previewTimer = setInterval(function () {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 512, 512);
    art.renderFrame(ctx, currentTraits, frame);
    ctx.restore();
    frame = (frame + 1) % art.FRAMES;
  }, art.FRAME_DELAY);
}

function stopPreview() {
  if (previewTimer) { clearInterval(previewTimer); previewTimer = null; }
}

/* ---------------- collection studio ---------------- */

function generateSet() {
  var size = clampInt($('gen-size').value, 1, 250, 24);
  var seedStr = $('gen-seed').value.trim();
  var base = seedStr ? art.hashStr(seedStr) : (Math.random() * 2147483647) | 0;
  var used = {};
  generatedSet = [];
  var i = 0;
  while (generatedSet.length < size && i < size * 40) {
    var t = art.randomTraits({}, (base + i * 7919) >>> 0);
    i++;
    var key = t.symbol + '/' + t.backdrop + '/' + t.palette + '/' + t.anim + '/' + t.effect;
    if (used[key]) continue;
    used[key] = 1;
    generatedSet.push({ traits: t, name: art.traitName(t), rarity: art.rarityOf(t) });
  }
  selectedItems = {};
  renderStudio();
}

function renderStudio() {
  var grid = $('collection-grid');
  var html = '';
  for (var i = 0; i < generatedSet.length; i++) {
    var g = generatedSet[i];
    html += '<div class="col-card" data-i="' + i + '">' +
      '<div class="c-check"></div>' +
      '<canvas width="64" height="64" data-i="' + i + '"></canvas>' +
      '<div class="c-name">' + escapeHtml(g.name) + ' #' + i + '</div>' +
      '<div class="c-rarity" style="color:' + g.rarity.color + '">' + g.rarity.tier + '</div></div>';
  }
  grid.innerHTML = html;
  var canvases = grid.querySelectorAll('canvas');
  for (var c = 0; c < canvases.length; c++) {
    var idx = parseInt(canvases[c].getAttribute('data-i'), 10);
    var ctx = canvases[c].getContext('2d');
    var cw = canvases[c].width;
    ctx.save();
    ctx.scale(cw / art.S, cw / art.S);
    art.renderFrame(ctx, generatedSet[idx].traits, 0);
    ctx.restore();
  }
  var cards = grid.querySelectorAll('.col-card');
  for (var k = 0; k < cards.length; k++) {
    cards[k].addEventListener('click', function () {
      var i2 = parseInt(this.getAttribute('data-i'), 10);
      if (selectedItems[i2]) { delete selectedItems[i2]; this.classList.remove('selected'); }
      else { selectedItems[i2] = true; this.classList.add('selected'); }
      updateBatchButton();
    });
  }
  renderRarityStats();
  updateBatchButton();
}

function renderRarityStats() {
  var counts = {};
  for (var i = 0; i < generatedSet.length; i++) {
    var tier = generatedSet[i].rarity.tier;
    counts[tier] = (counts[tier] || 0) + 1;
  }
  var order = ['Common', 'Rare', 'Epic', 'Legendary'];
  var colors = { Common: '#9aa0b5', Rare: '#4da3ff', Epic: '#b44dff', Legendary: '#ffd700' };
  var html = '';
  for (var j = 0; j < order.length; j++) {
    var t = order[j];
    html += '<span class="rs" style="color:' + colors[t] + '">' + t + ': ' + (counts[t] || 0) + '</span>';
  }
  $('rarity-stats').innerHTML = html;
}

function updateBatchButton() {
  var n = Object.keys(selectedItems).length;
  var btn = $('btn-mint-batch');
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? '⚡ Mint Selected' : '⚡ Mint ' + n + ' Selected';
}

/* ---------------- minting ---------------- */

async function uploadPiece(coll, index, traits, name, gifB64) {
  var attributes = [
    { trait_type: 'Model', value: traitDisplay('model', traits.model) },
    { trait_type: 'Backdrop', value: traitDisplay('backdrop', traits.backdrop) },
    { trait_type: 'Symbol', value: traitDisplay('symbol', traits.symbol) },
    { trait_type: 'Item', value: traitDisplay('item', traits.item) },
    { trait_type: 'Animation', value: traitDisplay('anim', traits.anim) },
    { trait_type: 'Effect', value: traitDisplay('effect', traits.effect) }
  ];
  var res = await fetch(WORKER_BASE + '/mint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collId: coll.id, index: index, name: name, gif: gifB64,
      attributes: attributes, collectionName: coll.name,
      collectionDesc: coll.desc, royalty: coll.royalty
    })
  });
  if (!res.ok) throw new Error('Artwork upload failed (HTTP ' + res.status + ')');
  return res.json();
}

async function deployCollection(owner, coll) {
  var cells = buildCollectionCells(owner, coll.id, coll.royalty);
  var addr = addressOf(cells.code, cells.data);
  coll.address = addr.toString();
  await sendTx([{
    to: addr.toString(),
    value: coreLib.toNano('0.1').toString(),
    stateInit: stateInitB64(cells.code, cells.data)
  }]);
  collections.push(coll);
  saveCollections();
  return addr;
}

async function mintSingle() {
  try {
    await ensureCore();
    if (!tonConnectUI || !tonConnectUI.wallet) { toast('Connect your wallet first', 'err'); return; }
    var owner = coreLib.Address.parse(tonConnectUI.account.address);

    $('btn-mint').disabled = true;

    setStatus('Preparing artwork…', 'busy');
    var gifB64;
    if (aiState.gifB64) {
      gifB64 = aiState.gifB64;
    } else {
      gifB64 = bytesToB64(await art.encodeGif(currentTraits));
    }

    var coll = null;
    var selId = $('mint-collection').value;
    if (selId) {
      coll = getColl(selId);
      if (!coll) throw new Error('Selected collection not found');
    } else {
      var cname = $('collection-name').value.trim() || 'Pixel Forge Collection';
      var cdesc = $('collection-desc').value.trim() || 'Animated pixel art minted on TON';
      var roy = clampNum($('royalty').value, 0, 30);
      coll = { id: randId(), name: cname, desc: cdesc, royalty: roy, nextIndex: 0 };
      setStatus('Deploying collection contract (~0.1 TON, one-time)…', 'busy');
      await deployCollection(owner, coll);
      setStatus('Collection deployed. Waiting for the chain to index it…', 'busy');
      await sleep(9000);
    }

    var index = coll.nextIndex;
    var nftName = $('nft-name').value.trim() ||
      (aiState.gifB64 && aiState.name ? aiState.name : (art.traitName(currentTraits) + ' #' + index));

    setStatus('Uploading artwork to metadata host…', 'busy');
    await uploadPiece(coll, index, currentTraits, nftName, gifB64);

    setStatus('Sending mint transaction (~0.08 TON)…', 'busy');
    var body = mintBodyCell(owner, index, coreLib.toNano('0.05'));
    await sendTx([{
      to: coll.address,
      value: coreLib.toNano('0.08').toString(),
      payload: body.toBoc().toString('base64')
    }]);

    coll.nextIndex = index + 1;
    saveCollections();

    var itemAddr = nftItemAddress(coll.address, index).toString();
    setStatus('Mint sent! ' + escapeHtml(nftName) + ' is on its way. View: ' +
      link(EXPLORER + '/' + itemAddr, 'tonviewer') + ' · ' +
      link(GEMS_BASE + '/collection/' + coll.address, 'getgems collection'), 'ok');
    toast('Mint transaction sent — check tonviewer in a few seconds', 'ok');
  } catch (e) {
    var msg = (e && e.message) ? e.message : String(e);
    if (msg.indexOf('reject') !== -1 || msg.indexOf('cancel') !== -1 || msg.indexOf('Cancel') !== -1) {
      setStatus('Mint cancelled in wallet.', 'err');
    } else {
      setStatus('Error: ' + msg, 'err');
      toast('Mint failed: ' + msg, 'err');
    }
  } finally {
    $('btn-mint').disabled = false;
  }
}

async function mintBatch() {
  try {
    await ensureCore();
    if (!tonConnectUI || !tonConnectUI.wallet) { toast('Connect your wallet first', 'err'); return; }
    var owner = coreLib.Address.parse(tonConnectUI.account.address);

    var selId = $('mint-collection-2').value;
    var coll = null;
    if (selId) {
      coll = getColl(selId);
      if (!coll) throw new Error('Selected collection not found');
    } else {
      var cname = $('collection-name').value.trim() || 'Pixel Forge Collection';
      var cdesc = $('collection-desc').value.trim() || 'Animated pixel art minted on TON';
      var roy = clampNum($('royalty').value, 0, 30);
      coll = { id: randId(), name: cname, desc: cdesc, royalty: roy, nextIndex: 0 };
      setStatus('Deploying collection contract first…', 'busy');
      await deployCollection(owner, coll);
      setStatus('Collection deployed. Waiting for the chain…', 'busy');
      await sleep(9000);
    }

    var idxs = Object.keys(selectedItems).map(function (n) { return parseInt(n, 10); }).sort(function (a, b) { return a - b; });
    if (idxs.length === 0) return;
    if (idxs.length > 250) idxs = idxs.slice(0, 250);

    var amountNano = coreLib.toNano('0.05');
    var totalValue = amountNano * BigInt(idxs.length) + coreLib.toNano('0.1');

    for (var u = 0; u < idxs.length; u++) {
      var gi = idxs[u];
      var g = generatedSet[gi];
      var idx = coll.nextIndex + u;
      var nm = g.name + ' #' + idx;
      setStatus('Uploading ' + (u + 1) + '/' + idxs.length + ': ' + nm + '…', 'busy');
      var gif2 = await art.encodeGif(g.traits);
      await uploadPiece(coll, idx, g.traits, nm, bytesToB64(gif2));
    }

    setStatus('Sending batch mint (' + idxs.length + ' NFTs)…', 'busy');
    var indexes = idxs.map(function (_, k2) { return coll.nextIndex + k2; });
    var body2 = batchBodyCell(owner, indexes, amountNano);
    await sendTx([{
      to: coll.address,
      value: totalValue.toString(),
      payload: body2.toBoc().toString('base64')
    }]);

    coll.nextIndex += idxs.length;
    saveCollections();
    setStatus('Batch of ' + idxs.length + ' minted! View: ' + link(EXPLORER + '/' + coll.address, 'tonviewer') + ' · ' + link(GEMS_BASE + '/collection/' + coll.address, 'getgems'), 'ok');
    selectedItems = {};
    renderStudio();
  } catch (e) {
    var msg2 = (e && e.message) ? e.message : String(e);
    setStatus('Error: ' + msg2, 'err');
    toast('Batch mint failed: ' + msg2, 'err');
  } finally {
    updateBatchButton();
  }
}

/* ---------------- gif download ---------------- */

async function downloadGif() {
  try {
    var gif = await art.encodeGif(currentTraits);
    var blob = new Blob([gif], { type: 'image/gif' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = art.traitName(currentTraits).replace(/\s+/g, '_').toLowerCase() + '.gif';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch (e) {
    toast('GIF export failed: ' + (e.message || e), 'err');
  }
}

/* ---------------- AI Studio (bring-your-own API) ---------------- */

var aiState = { image: null, name: '', gifB64: null };
var _gifencLib = null;

function aiStatus(msg, cls) {
  var el = $('ai-status');
  el.textContent = msg || '';
  el.className = 'mint-status' + (cls ? ' ' + cls : '');
}

var AI_PRESETS = {
  mock: {
    endpointSuffix: '/mockgen',
    headerName: '',
    headerValue: '',
    template: '{"prompt": "{{PROMPT}}"}',
    responsePath: 'url'
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/images/generations',
    headerName: 'Authorization',
    headerValue: 'Bearer {{KEY}}',
    template: '{"model": "gpt-image-1", "prompt": "{{PROMPT}}", "size": "1024x1024", "n": 1}',
    responsePath: 'data[0].url'
  },
  generic: {
    endpoint: '',
    headerName: 'x-api-key',
    headerValue: '{{KEY}}',
    template: '{"prompt": "{{PROMPT}}"}',
    responsePath: 'data[0].url'
  }
};

function aiApplyPreset(name) {
  var p = AI_PRESETS[name];
  if (!p) return;
  if (name === 'mock') {
    $('ai-endpoint').value = location.origin + p.endpointSuffix;
  } else {
    $('ai-endpoint').value = p.endpoint;
  }
  $('ai-header-name').value = p.headerName;
  $('ai-header-value').value = p.headerValue;
  $('ai-template').value = p.template;
  $('ai-response-path').value = p.responsePath;
}

function aiGetConfig() {
  return {
    endpoint: $('ai-endpoint').value.trim(),
    headerName: $('ai-header-name').value.trim(),
    headerValue: $('ai-header-value').value,
    apiKey: $('ai-key').value,
    template: $('ai-template').value,
    responsePath: $('ai-response-path').value.trim()
  };
}

function aiSaveConfig() {
  localStorage.setItem('forge_ai_v1', JSON.stringify(aiGetConfig()));
  aiStatus('Config saved in this browser.', 'ok');
}

function aiLoadConfig() {
  try {
    var c = JSON.parse(localStorage.getItem('forge_ai_v1') || 'null');
    if (c && c.endpoint) {
      $('ai-endpoint').value = c.endpoint || '';
      $('ai-header-name').value = c.headerName || '';
      $('ai-header-value').value = c.headerValue || '';
      $('ai-key').value = c.apiKey || '';
      $('ai-template').value = c.template || '';
      $('ai-response-path').value = c.responsePath || '';
      return true;
    }
  } catch (e) {}
  return false;
}

function aiResolvePath(obj, path) {
  if (!path) return null;
  var parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return null;
    cur = cur[parts[i]];
  }
  return cur;
}

async function aiGenerate() {
  try {
    var cfg = aiGetConfig();
    if (!cfg.endpoint) { aiStatus('Enter an endpoint URL first (or pick the Demo preset).', 'err'); return; }
    var prompt = $('ai-prompt').value.trim() || 'A glossy royal crown jewel on deep velvet, golden sparkles, premium collectible render, centered, dark background';
    var bodyStr = cfg.template.split('{{PROMPT}}').join(prompt).split('{{KEY}}').join(cfg.apiKey);
    var headers = { 'Content-Type': 'application/json' };
    if (cfg.headerName) headers[cfg.headerName] = cfg.headerValue.split('{{KEY}}').join(cfg.apiKey);

    aiStatus('Calling generation endpoint…', 'busy');
    var resp;
    try {
      resp = await fetch(cfg.endpoint, { method: 'POST', headers: headers, body: bodyStr });
    } catch (e) {
      aiStatus('Request failed (network or CORS blocked): ' + e.message, 'err');
      return;
    }
    if (!resp.ok) {
      var t = await resp.text();
      aiStatus('Endpoint error ' + resp.status + ': ' + t.slice(0, 160), 'err');
      return;
    }
    var ct = resp.headers.get('content-type') || '';
    var src = null;
    if (ct.indexOf('image/') === 0) {
      src = URL.createObjectURL(await resp.blob());
    } else {
      var data = await resp.json();
      var val = aiResolvePath(data, cfg.responsePath || 'url');
      if (!val) { aiStatus('Could not find image at response path "' + (cfg.responsePath || 'url') + '".', 'err'); return; }
      if (String(val).indexOf('http') === 0) {
        src = val;
      } else {
        src = 'data:image/png;base64,' + val;
      }
    }
    var img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise(function (resolve, reject) {
      img.onload = resolve;
      img.onerror = function () { reject(new Error('Image failed to load (check CORS on image host)')); };
      img.src = src;
    });
    aiState.image = img;
    aiState.name = prompt.slice(0, 40);
    $('ai-preview').src = src;
    aiStatus('Image ready. Now pick a motion and hit "Animate → GIF".', 'ok');
  } catch (e) {
    aiStatus('Generate failed: ' + ((e && e.message) || e), 'err');
  }
}

async function aiGetGifenc() {
  if (_gifencLib) return _gifencLib;
  _gifencLib = await import('https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js');
  return _gifencLib;
}

async function aiAnimate() {
  try {
    if (!aiState.image) { aiStatus('Generate an image first.', 'err'); return; }
    var motion = $('ai-motion').value;
    var intensity = parseFloat($('ai-intensity').value) || 1;
    var glow = $('ai-glow').value === '1';
    aiStatus('Encoding animated GIF (16 frames, 512px)…', 'busy');

    var gifenc = await aiGetGifenc();
    var c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    var ctx = c.getContext('2d');
    var frames = [];
    for (var f = 0; f < 16; f++) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 512, 512);
      var ph = (f / 16) * Math.PI * 2;
      var dx = 0, dy = 0, sc = 1, rot = 0;
      if (motion === 'float') dy = Math.sin(ph) * 12 * intensity;
      if (motion === 'pulse') sc = 1 + 0.05 * Math.sin(ph) * intensity;
      if (motion === 'shimmer') sc = 1 + 0.02 * Math.sin(ph * 2) * intensity;
      if (motion === 'orbit') { dx = Math.cos(ph) * 8 * intensity; dy = Math.sin(ph) * 6 * intensity; rot = Math.sin(ph) * 0.04 * intensity; }
      if (motion === 'zoom') sc = 1.02 + 0.06 * (0.5 - 0.5 * Math.cos(ph)) * intensity;
      ctx.save();
      ctx.translate(256 + dx, 256 + dy);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      if (glow) {
        ctx.shadowColor = 'rgba(255,255,255,0.4)';
        ctx.shadowBlur = 16 + 14 * Math.max(0, Math.sin(ph));
      }
      ctx.drawImage(aiState.image, -256, -256, 512, 512);
      ctx.restore();
      if (motion === 'shimmer') {
        var sx = -300 + 900 * (f / 16);
        var sg = ctx.createLinearGradient(sx, 0, sx + 220, 512);
        sg.addColorStop(0, 'rgba(255,255,255,0)');
        sg.addColorStop(0.5, 'rgba(255,255,255,0.16)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, 512, 512);
      }
      frames.push(ctx.getImageData(0, 0, 512, 512).data);
    }

    var palData = new Uint8Array(512 * 512 * 4 * 2);
    palData.set(frames[0], 0);
    palData.set(frames[8], 512 * 512 * 4);
    var palette = gifenc.quantize(palData, 255, { format: 'rgb565' });
    var gif = gifenc.GIFEncoder();
    for (var k = 0; k < frames.length; k++) {
      var index = gifenc.applyPalette(frames[k], palette, 'rgb565');
      gif.writeFrame(index, 512, 512, { palette: k === 0 ? palette : undefined, delay: 90 });
    }
    gif.finish();
    var bytes = gif.bytes();
    aiState.gifB64 = bytesToB64(gif.bytes());
    aiStatus('Animated GIF ready (' + Math.round(gif.bytes().length / 1024) + ' KB). Open Forge and MINT — this artwork will be used.', 'ok');
  } catch (e) {
    aiStatus('Animate failed: ' + ((e && e.message) || e), 'err');
  }
}

function aiInit() {
  $('ai-preset').addEventListener('change', function () { aiApplyPreset(this.value); });
  $('ai-save').addEventListener('click', aiSaveConfig);
  $('ai-generate').addEventListener('click', aiGenerate);
  $('ai-animate').addEventListener('click', aiAnimate);
  if (!aiLoadConfig()) aiApplyPreset('mock');
}

/* ---------------- boot ---------------- */

function wireButtons() {
  $('btn-reroll').addEventListener('click', reroll);
  $('btn-download').addEventListener('click', downloadGif);
  $('btn-mint').addEventListener('click', mintSingle);
  $('btn-generate').addEventListener('click', generateSet);
  $('btn-mint-batch').addEventListener('click', mintBatch);
  aiInit();
}

function init() {
  currentTraits = art.randomTraits({});
  initTabs();
  updateArtMeta();
  renderTraits();
  startPreview();
  loadCollections();
  initWallet();
  wireButtons();
  setStatus('Connect a wallet, then hit MINT. First mint deploys your collection (~0.1 TON), every NFT after is ~0.055 TON.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}