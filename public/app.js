const escape = value => String(value ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const fillings = [['韭菜鸡蛋','Poireau et œuf'],['鲜肉','Porc'],['牛肉','Bœuf']];
const productFillings = {
  A1: [['韭菜鸡蛋','Poireau et œuf']],
  A2: [['猪肉白菜','Porc et chou'],['鲜肉','Porc'],['韭菜猪肉','Porc et poireau']],
  A3: [['红油牛肉包','Bao au bœuf pimenté'],['牛肉鲜肉包','Bao au bœuf frais']]
};
const cooking = {包子:[['清蒸','Vapeur'],['煎包','Poêlé']],饺子:[['水煮','À l’eau'],['清蒸','Vapeur'],['煎饺','Poêlés']]};
const copyItems = items => items.map(item => ({...item}));
const sessionKey=key=>key+(window.BaoRuntime?.storeId?':'+BaoRuntime.storeId+':'+BaoRuntime.sessionId:'');
const readSession = (key, fallback) => {try {return JSON.parse(sessionStorage.getItem(sessionKey(key)) || 'null') ?? fallback} catch {return fallback}};
const saveSession = (key, value) => {try {sessionStorage.setItem(sessionKey(key), JSON.stringify(value))} catch {}};
const pendingSelf = () => BaoOrders.pending('self');
const euro = value => `${Number(value).toFixed(2).replace('.',',')} €`;
const sumItems = items => items.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * Number(item.qty), 0) / 100;
const itemKey = item => JSON.stringify([item.code, item.filling || '', item.style || '']);
const normalise = value => String(value || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
const portion = product => /^B[1-4]$/.test(product.code) ? '9 个 / 9 pièces' : '';
const choice = document.querySelector('#choice-dialog');
const choiceOptions = document.querySelector('#choice-options');
const paymentDialog = document.querySelector('#payment-dialog');
const receipt = document.querySelector('#receipt-dialog');
const cachedCart = readSession('baoSelfCart', []);
let cart = copyItems(pendingSelf()?.items || (Array.isArray(cachedCart) ? cachedCart : []));
let service = pendingSelf()?.service || readSession('baoSelfService', '堂食');
if (!['堂食', '打包'].includes(service)) service = '堂食';
let selection = null, editingKey = null, paymentBusy = false, confirmedQuote = null, choiceNotice = '';
let selectedCategory = '全部', toastTimer = null, menuSignature = '';
let lastOrder = readSession('baoSelfLastOrder', null), receiptCheckedAt = null;
if (!lastOrder || typeof lastOrder.id !== 'string' || !Array.isArray(lastOrder.items) || lastOrder.source !== 'self') lastOrder = null;
const total = () => sumItems(cart);
const locked = () => paymentBusy || !!pendingSelf();

function feedback(message) {
  const element = document.querySelector('#cart-feedback');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.hidden = false;
  toastTimer = setTimeout(() => {element.hidden = true}, 3200);
}

function optionGroup(title, values, field, fieldFr) {
  const group = document.createElement('fieldset');
  group.className = 'option-group';
  group.dataset.option = field;
  const legend = document.createElement('legend');
  legend.textContent = title;
  group.append(legend);
  for (const [zh, fr] of values) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-button';
    button.classList.toggle('selected', selection[field] === zh);
    button.setAttribute('aria-pressed', String(selection[field] === zh));
    button.innerHTML = `${escape(zh)}<small>${escape(fr)}</small>`;
    button.disabled = locked();
    button.onclick = () => {
      if (locked()) return;
      selection[field] = zh;
      selection[fieldFr] = fr;
      group.querySelectorAll('button').forEach(item => {
        const selected = item === button;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      updateChoice();
    };
    group.append(button);
  }
  return group;
}

function updateChoice(message = choiceNotice) {
  if (!selection) return;
  const latest = BaoCatalog.get(selection.code);
  const quantity = Number(document.querySelector('#choice-qty').value);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 999;
  const needsOptions = !!cooking[selection.category];
  const complete = !needsOptions || (!!selection.filling && !!selection.style);
  document.querySelector('#choice-minus').disabled = locked() || !validQuantity || quantity <= 1;
  document.querySelector('#choice-plus').disabled = locked() || !validQuantity || quantity >= 999;
  document.querySelector('#choice-qty').disabled = locked();
  document.querySelector('#choice-subtotal').textContent = validQuantity ? euro(selection.price * quantity) : '—';
  document.querySelector('#choice-add').disabled = locked() || !latest?.active || !complete || !validQuantity;
  document.querySelector('#choice-add').textContent = editingKey ? '保存修改' : '加入购物车';
  document.querySelector('#choice-message').textContent = message || (!latest?.active ? latest?.soldOut?'此商品已售罄，请选择其他商品。':'此商品已下架，请选择其他商品。' : !validQuantity ? '请输入 1 至 999 的整数数量。' : !complete ? '请选择馅料和做法，再加入购物车。' : '');
}

function openChoice(product, item = null) {
  if (locked() || !product?.active) return;
  if(!item&&window.BaoVariantPicker?.open(product,items=>{if(locked())throw Error('订单正在提交，请稍后');for(const value of items){const same=cart.find(x=>itemKey(x)===itemKey(value));if((same?.qty||0)+value.qty>999)throw Error('同一规格最多 999 份')}for(const value of items){const same=cart.find(x=>itemKey(x)===itemKey(value));if(same)same.qty+=value.qty;else cart.push(value)}renderCart();feedback('已按馅料和做法分别加入购物车')}))return;
  selection = {...product};
  choiceNotice = '';
  editingKey = item ? itemKey(item) : null;
  const availableFillings = cooking[product.category] ? productFillings[product.code] || fillings : [];
  const availableCooking = cooking[product.category] || [];
  for (const [field, fieldFr, values] of [['filling','fillingFr',availableFillings], ['style','styleFr',availableCooking]]) {
    const previous = item && values.find(([zh]) => zh === item[field]);
    const selected = previous || (values.length === 1 ? values[0] : null);
    if (selected) [selection[field], selection[fieldFr]] = selected;
  }
  document.querySelector('#choice-step').textContent = editingKey ? '修改已选商品 · Modifier' : '选好口味与数量 · Personnaliser';
  document.querySelector('#choice-title').textContent = product.dish;
  document.querySelector('#choice-product').textContent = [product.code, product.fr, portion(product), euro(product.price)].filter(Boolean).join(' · ');
  document.querySelector('#choice-qty').value = item?.qty || 1;
  choiceOptions.replaceChildren();
  if (availableFillings.length) choiceOptions.append(optionGroup('馅料 · Garniture', availableFillings, 'filling', 'fillingFr'));
  if (availableCooking.length) choiceOptions.append(optionGroup('做法 · Cuisson', availableCooking, 'style', 'styleFr'));
  updateChoice();
  choice.showModal();
}

function chooseProduct(button) {openChoice(BaoCatalog.get(button.dataset.code))}

function addSelection() {
  if (locked() || !selection) return;
  const latest = BaoCatalog.get(selection.code);
  if (!latest?.active) {updateChoice('此商品已下架，请选择其他商品。'); return}
  const quantity = Number(document.querySelector('#choice-qty').value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999 || (cooking[selection.category] && (!selection.filling || !selection.style))) {updateChoice(); return}
  if (latest.price !== selection.price) {
    selection.price = latest.price;
    document.querySelector('#choice-product').textContent = [latest.code, latest.fr, portion(latest), euro(latest.price)].filter(Boolean).join(' · ');
    updateChoice('商品价格已更新，请核对金额后再次确认。');
    return;
  }
  const previousIndex = editingKey ? cart.findIndex(item => itemKey(item) === editingKey) : -1;
  if (editingKey && previousIndex === -1) {updateChoice('此商品已从购物车移除，请关闭后重新选择。'); return}
  const item = {...selection, dish: latest.dish, fr: latest.fr, price: latest.price, qty: quantity};
  const sameIndex = cart.findIndex((entry, index) => index !== previousIndex && itemKey(entry) === itemKey(item));
  if (sameIndex >= 0 && cart[sameIndex].qty + item.qty > 999) {updateChoice('同款商品最多 999 件，请减少数量后重试。'); return}
  const wasEditing = !!editingKey;
  if (sameIndex >= 0) cart[sameIndex].qty += item.qty;
  else if (previousIndex >= 0) cart[previousIndex] = item;
  else cart.push(item);
  if (sameIndex >= 0 && previousIndex >= 0) cart.splice(previousIndex, 1);
  choice.close();
  renderCart();
  feedback(wasEditing ? '商品选择已更新' : `已加入 ${item.dish} × ${item.qty}`);
}

function renderCart() {
  const pending = pendingSelf();
  cart = pending ? copyItems(pending.items) : BaoCatalog.reprice(cart);
  if (pending) service = pending.service;
  window.BaoTable?.sync(service,pending);
  saveSession('baoSelfCart', cart);
  saveSession('baoSelfService', service);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const holder = document.querySelector('#cart-items');
  document.querySelector('#cart-count').textContent = `${count} 件`;
  holder.innerHTML = cart.length ? cart.map((item, index) => `<div class="cart-row"><div><strong><b>${escape(item.code)}</b> · ${escape(item.dish)}</strong><small>${escape(item.fr)}${item.filling ? ` · ${escape(item.filling)} / ${escape(item.fillingFr)} · ${escape(item.style)} / ${escape(item.styleFr)}` : ''}</small><small>${portion(item)}${portion(item) ? ' · ' : ''}${euro(item.price)} × ${item.qty}</small><button type="button" class="cart-edit" data-edit="${index}" ${locked() ? 'disabled' : ''}>修改选择 / Modifier</button></div><div><strong>${euro(item.price * item.qty)}</strong><div class="quantity"><button type="button" data-change="-1" data-index="${index}" aria-label="减少 ${escape(item.dish)} 数量" ${locked() ? 'disabled' : ''}>−</button><b>${item.qty}</b><button type="button" data-change="1" data-index="${index}" aria-label="增加 ${escape(item.dish)} 数量" ${locked() || item.qty >= 999 ? 'disabled' : ''}>＋</button><button type="button" class="remove" data-remove="${index}" aria-label="移除 ${escape(item.dish)} / Retirer ${escape(item.fr || item.dish)}" ${locked() ? 'disabled' : ''}>移除 · Retirer</button></div></div></div>`).join('') : '<p class="empty">还没有选好？先看看菜单吧<br><small>Choisissez vos produits dans le menu</small></p>';
  holder.querySelectorAll('[data-change]').forEach(button => button.onclick = () => {
    if (locked()) return;
    const index = Number(button.dataset.index), item = cart[index];
    const quantity = item.qty + Number(button.dataset.change);
    if (quantity > 999) return;
    if (quantity < 1) cart.splice(index, 1); else item.qty = quantity;
    renderCart();
  });
  holder.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
    if (locked()) return;
    const [removed] = cart.splice(Number(button.dataset.remove), 1);
    renderCart();
    feedback(`已移除 ${removed.dish} · Retiré : ${removed.fr || removed.dish}`);
  });
  holder.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => {
    if (locked()) return;
    const item = cart[Number(button.dataset.edit)];
    openChoice(BaoCatalog.get(item.code), item);
  });
  document.querySelector('#cart-total').textContent = euro(total());
  document.querySelector('#pay-button').disabled = paymentBusy || (!cart.length && !pending);
  document.querySelector('#pay-button').textContent = !cart.length&&!pending ? '请先选择商品加入购物车' : pending ? '核对上次订单' : (window.BaoRuntime?.mode==='mock'?'确认订单，模拟付款':'确认订单，到柜台付款');
  document.querySelectorAll('.service-choice').forEach(button => {
    const active = button.dataset.service === service;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelector('#mobile-cart-count').textContent = `${count} 件商品`;
  document.querySelector('#mobile-cart-total').textContent = euro(total());
  document.querySelector('#mobile-cart-open').textContent = pending ? '核对订单' : '查看订单';
  document.querySelector('#customer-cart-bar').hidden = !count && !pending;
  document.body.classList.toggle('has-customer-cart', !!count || !!pending);
}

function setCategory(category, clearSearch = false) {
  selectedCategory = category;
  const search = document.querySelector('#menu-search');
  if (clearSearch) search.value = '';
  const query = search.value.trim();
  const words = normalise(query).split(/\s+/).filter(Boolean);
  const meta = {
    全部: ['À LA CARTE','全部商品','先选商品，再选择口味和数量'],
    包子: ['A · BAO','包子','可选馅料和做法，确认后加入购物车'],
    饺子: ['B · DUMPLINGS','饺子','B1–B4 每份 9 个，可选馅料和做法'],
    粥品: ['C · CONGEE','粥品','选择商品后，可调整购买数量'],
    其他: ['D · AUTRES','其他','选择商品后，可调整购买数量']
  }[category] || ['À LA CARTE','全部商品','先选商品，再选择口味和数量'];
  document.querySelector('#category-code').textContent = query ? 'RECHERCHE' : meta[0];
  document.querySelector('#category-title').textContent = query ? '搜索结果' : meta[1];
  document.querySelector('#menu-hint').textContent = query ? `正在全部商品中查找“${query}”` : meta[2];
  let visible = 0;
  document.querySelectorAll('.product-card').forEach(card => {
    const product = BaoCatalog.get(card.dataset.code);
    const matches = (product?.active || product?.soldOut) && (query ? words.every(word => normalise([product.code, product.dish, product.fr, product.category].join(' ')).includes(word)) : category === '全部' || product.category === category);
    card.hidden = !matches;
    if (matches) visible++;
  });
  document.querySelectorAll('.category').forEach(button => {
    const active = button.dataset.category === (query ? '全部' : category);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelector('#search-clear').hidden = !query;
  document.querySelector('#search-result').textContent = query ? `找到 ${visible} 款商品` : '';
  const empty = document.querySelector('#menu-empty');
  empty.hidden = visible > 0;
  empty.textContent = query ? '没有找到相关商品，请换个名称、法文或编号，或清除搜索。' : '这个分类暂时没有可点商品，请看看其他分类。';
}

const quoteKey = (items, orderService) => JSON.stringify([orderService, ...items.map(item => [item.code, Math.round(Number(item.price) * 100), Number(item.qty), item.filling || '', item.style || ''])]);

function showOrderSummary(message = '') {
  const pending = pendingSelf();
  confirmedQuote = {items: copyItems(pending?.items || cart), service: pending?.service || service, tableNumber:pending?.tableNumber??window.BaoTable?.value(service)??''};
  document.querySelector('#confirm-service').textContent = confirmedQuote.service+(confirmedQuote.tableNumber?' · '+confirmedQuote.tableNumber+' 桌':'');
  document.querySelector('#confirm-items').innerHTML = confirmedQuote.items.map(item => `<li><span>${escape(item.dish)}${item.filling ? ' · ' + escape(item.filling) : ''}${item.style ? ' · ' + escape(item.style) : ''} × ${item.qty}</span><strong>${euro(item.price * item.qty)}</strong></li>`).join('');
  document.querySelector('#confirm-total').textContent = euro(sumItems(confirmedQuote.items));
  document.querySelector('#confirm-message').textContent = message;
  document.querySelector('[data-method]').textContent = pending ? '核对上次订单' : (window.BaoRuntime?.mode==='mock'?'确认提交，进入模拟付款':'确认提交，到柜台付款');
  document.querySelector('[data-method]').disabled = !confirmedQuote.items.length && !pending;
}

function receiptStatus(order) {
  if (order.status === 'cancelled') return order.cancelledAt?'已取消':'已登记退款';
  if (order.status === 'voided') return '已作废';
  if (order.status === 'done' || order.kitchenStatus === 'complete') return '已取餐';
  if (['paid', 'done'].includes(order.status)) return order.kitchenStatus === 'ready' ? '可以取餐' : order.kitchenStatus==='making'?'制作中':order.isTest?'已模拟付款':'已付款';
  return order.isTest?'待模拟付款':'待柜台付款';
}

function renderReceipt() {
  const entry = document.querySelector('#last-order-button');
  entry.hidden = !lastOrder;
  if (!lastOrder) return;
  entry.textContent = `查看刚才的订单 · ${receiptStatus(lastOrder)}`;
  const order = lastOrder;
  const paid = ['paid', 'done'].includes(order.status), closed = ['voided', 'cancelled'].includes(order.status);
  document.querySelector('#receipt-title').textContent = closed ? (order.status === 'cancelled' ? (order.cancelledAt?'订单已取消':'订单已登记退款') : '订单已作废') : paid ? `订单${receiptStatus(order)}` : (order.isTest?'订单已提交，待模拟付款':'订单已提交，待柜台付款');
  document.querySelector('#receipt-instructions').textContent = closed ? '请联系收银员核对，勿为此订单再次付款。如需购买，请重新点单。' : paid ? (order.kitchenStatus === 'ready' ? '餐品已备好，请向店员出示取餐号。' : order.status === 'done' || order.kitchenStatus === 'complete' ? '本单已完成取餐，感谢光临。' : '请留意取餐屏幕 · Merci d’attendre votre numéro') : (order.isTest?'点击下方模拟付款后安排制作，不会扣款。':'请向收银员出示订单号，付款后安排制作。');
  document.querySelector('#pickup-label').textContent = paid ? '取餐号 · NUMÉRO' : '订单号 · NUMÉRO';
  document.querySelector('#pickup-number').textContent = order.pickupNumber || order.id;
  document.querySelector('#receipt-total').textContent = order.service + (order.tableNumber?' · '+order.tableNumber+' 桌':'') + ' · ' + (closed ? '此订单无需再次付款' : paid ? (order.isTest?'模拟金额 ':'已付 ') + euro(order.isTest?order.total:order.paidTotal) : '待付 ' + euro(order.total));
  document.querySelector('#mock-pay-receipt').hidden=!(order.isTest&&order.status==='pending');
  document.querySelector('#receipt-items').innerHTML = order.items.map(item => `<li><span>${escape(item.dish)}${item.filling ? ' · ' + escape(item.filling) : ''}${item.style ? ' · ' + escape(item.style) : ''} × ${item.qty}</span><strong>${euro(item.price * item.qty)}</strong></li>`).join('');
  document.querySelector('#receipt-updated').textContent = !navigator.onLine ? '当前离线，显示此设备保存的订单；联网后会再次核对。' : receiptCheckedAt ? `最近核对 ${receiptCheckedAt.toLocaleTimeString()} · 状态变化会自动更新` : '显示此设备保存的订单，正在核对最新状态…';
  if (navigator.onLine && document.querySelector('[data-orders-status].sync-error')) document.querySelector('#receipt-updated').textContent = '暂时无法核对最新状态，以下为本机保存记录，请联网后重试。';
}

function reconcileReceipt() {
  if (!lastOrder) return;
  const current = BaoOrders.all().find(order => order.id === lastOrder.id && order.source === 'self');
  if (current) {
    lastOrder = {...current, items: copyItems(current.items)};
    receiptCheckedAt = new Date();
    saveSession('baoSelfLastOrder', lastOrder);
  }
  renderReceipt();
}

async function refreshReceipt() {
  if (!lastOrder) return;
  const id = lastOrder.id;
  renderReceipt();
  const refreshed = await BaoOrders.refresh();
  if (!lastOrder || lastOrder.id !== id) return;
  if (refreshed) {
    reconcileReceipt();
    if (!BaoOrders.all().some(order => order.id === id && order.source === 'self')) document.querySelector('#receipt-updated').textContent = '暂未查到这笔订单的最新状态，以下为本机保存记录，请向收银员核对。';
  } else document.querySelector('#receipt-updated').textContent = '暂时无法核对最新状态，以下为本机保存记录，请联网后重试。';
}

async function completePayment() {
  if (paymentBusy) return;
  paymentBusy = true;
  document.querySelector('main').inert = true;
  document.querySelectorAll('[data-method]').forEach(button => button.disabled = true);
  try {
    const pending = pendingSelf();
    let payload = pending;
    if (!pending) {
      if (!confirmedQuote) throw Error('请先核对订单内容');
      if (!await BaoCatalog.refresh()) throw Error('无法核对云端价格，请联网后重试');
      renderCart();
      if (quoteKey(cart, service) !== quoteKey(confirmedQuote.items, confirmedQuote.service)) {
        showOrderSummary('商品价格或上架状态已变化，订单尚未提交。请核对最新商品与金额后再次确认。');
        return;
      }
      if (!cart.length) return;
      payload = {id: window.baoOrderId(), items: copyItems(confirmedQuote.items), payment: '待付款', service: confirmedQuote.service, tableNumber:confirmedQuote.tableNumber, source: 'self'};
    }
    const order = await BaoOrders.submit(payload);
    cart = [];
    paymentDialog.close();
    confirmedQuote = null;
    lastOrder = {...order, items: copyItems(order.items)};
    receiptCheckedAt = new Date();
    saveSession('baoSelfLastOrder', lastOrder);
    renderReceipt();
    receipt.showModal();
    renderCart();
  } catch (error) {
    renderCart();
    showOrderSummary(error.message);
  } finally {
    paymentBusy = false;
    document.querySelector('main').inert = false;
    renderCart();
    window.dispatchEvent(new Event('bao-submit-state'));
    document.querySelectorAll('[data-method]').forEach(button => button.disabled = !cart.length && !pendingSelf());
  }
}

const mockPay=document.createElement('button');mockPay.id='mock-pay-receipt';mockPay.type='button';mockPay.textContent='模拟付款 · 不会扣款';mockPay.hidden=true;const mockMessage=document.createElement('p');mockMessage.id='mock-pay-message';mockMessage.setAttribute('role','status');receipt.querySelector('.done').before(mockPay,mockMessage);
mockPay.onclick=async()=>{if(!lastOrder||mockPay.disabled)return;mockPay.disabled=true;mockMessage.textContent='正在确认模拟付款…';try{await BaoOrders.change(lastOrder.id,'mock-pay');reconcileReceipt();mockMessage.textContent='模拟付款成功，厨房已收到订单。'}catch(error){mockMessage.textContent=error.message}finally{mockPay.disabled=false}};

document.querySelectorAll('.category').forEach(button => button.onclick = () => setCategory(button.dataset.category, true));
document.querySelector('#menu-search').addEventListener('input', () => setCategory(selectedCategory));
document.querySelector('#search-clear').onclick = () => {setCategory('全部', true); document.querySelector('#menu-search').focus()};
document.querySelectorAll('.service-choice').forEach(button => button.onclick = () => {if (!locked()) {service = button.dataset.service; renderCart()}});
document.querySelector('#clear-button').onclick = () => {
  if (locked() || (cart.length && !confirm('清空当前购物车？ / Vider le panier ?'))) return;
  cart = [];
  renderCart();
};
document.querySelector('#pay-button').onclick = () => {
  if (!paymentBusy && (cart.length || pendingSelf())) {if(!pendingSelf()&&!window.BaoTable?.validate(service))return;showOrderSummary(); paymentDialog.showModal()}
};
document.querySelectorAll('[data-method]').forEach(button => button.onclick = () => completePayment());
document.querySelector('#choice-add').onclick = addSelection;
document.querySelector('#choice-qty').addEventListener('input', () => updateChoice());
for (const [id, change] of [['#choice-minus', -1], ['#choice-plus', 1]]) document.querySelector(id).onclick = () => {
  if (locked()) return;
  const input = document.querySelector('#choice-qty');
  const next = Number(input.value) + change;
  if (Number.isInteger(next) && next >= 1 && next <= 999) input.value = next;
  updateChoice();
};
choice.querySelector('form').addEventListener('submit', event => event.preventDefault());
choice.querySelector('.close').type = 'button';
choice.querySelector('.close').onclick = () => choice.close();
document.querySelector('#choice-qty').addEventListener('keydown', event => {if (event.key === 'Enter') event.preventDefault()});
choice.addEventListener('close', () => {selection = null; editingKey = null; choiceNotice = ''});
document.querySelector('#last-order-button').onclick = () => {if (lastOrder) {renderReceipt(); receipt.showModal(); refreshReceipt()}};
window.addEventListener('bao-orders-change', reconcileReceipt);
window.addEventListener('offline', renderReceipt);
window.addEventListener('online', refreshReceipt);
window.addEventListener('DOMContentLoaded', () => {
  const status = document.querySelector('[data-orders-status]');
  if (status) new MutationObserver(() => {
    if (!lastOrder) return;
    if (status.classList.contains('sync-error')) renderReceipt();
    else if (BaoOrders.ready()) reconcileReceipt();
  }).observe(status, {attributes: true, attributeFilter: ['class'], childList: true});
});

const productImages = new Map(Array.from(document.querySelectorAll('.product-card')).map(card => [card.dataset.code, card.querySelector('img')?.getAttribute('src')]));
function syncMenu() {
  const products = BaoCatalog.all(), signature = JSON.stringify(products);
  const previousCart = copyItems(cart), hadMenu = !!menuSignature;
  if (signature !== menuSignature) {
    const grid = document.querySelector('#product-grid');
    grid.replaceChildren();
    for (const product of products) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'product-card';
      card.dataset.code = product.code;
      card.dataset.category = product.category;
      card.dataset.price = product.price;
      card.disabled = !product.active;
      if(product.soldOut){const badge=document.createElement('span');badge.className='soldout-label';badge.textContent='售罄 · Épuisé';card.append(badge)}
      const customSource = BaoCatalog.customImage(product);
      const source = customSource || productImages.get(product.code);
      if (source) {
        const img = document.createElement('img');
        img.src = source;
        img.alt = '';
        img.loading = 'lazy';
        const photo = document.createElement('div');
        photo.className = 'product-photo' + (customSource ? ' custom-product-photo' : '');
        img.onerror = () => {photo.className = 'product-placeholder';photo.textContent = product.category;photo.setAttribute('aria-hidden', 'true')};
        photo.append(img);
        card.append(photo);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'product-placeholder';
        placeholder.textContent = product.category;
        placeholder.setAttribute('aria-hidden', 'true');
        card.append(placeholder);
      }
      const label = document.createElement('i'); label.textContent = product.code;
      const name = document.createElement('strong'); name.textContent = product.dish + (portion(product) ? ' · 9个' : '');
      const fr = document.createElement('small'); fr.textContent = product.fr + (portion(product) ? ' · 9 pièces' : '');
      const price = document.createElement('b'); price.textContent = euro(product.price);
      card.append(label, name, fr);

      card.append(price);
      card.onclick = () => chooseProduct(card);
      grid.append(card);
    }
    menuSignature = signature;
  }
  const other = document.querySelector('.category[data-category="其他"]');
  other.hidden = !products.some(product => product.category === '其他' && product.active);
  if (other.hidden && selectedCategory === '其他') selectedCategory = '全部';
  setCategory(selectedCategory);
  renderCart();
  if (hadMenu && !locked()) {
    const removed = previousCart.filter(item => !cart.some(current => itemKey(current) === itemKey(item)));
    const changedPrice = cart.some(item => previousCart.some(previous => itemKey(previous) === itemKey(item) && previous.price !== item.price));
    if (removed.length) feedback('有商品已下架，已从购物车移除，请核对订单。');
    else if (changedPrice) feedback('商品价格已更新，购物车金额已同步，请核对订单。');
  }
  if (selection && choice.open) {
    const latest = BaoCatalog.get(selection.code);
    if (!latest?.active) choiceNotice = '此商品已下架，无法加入购物车，请关闭后选择其他商品。';
    else if (latest.price !== selection.price) {
      selection.price = latest.price;
      document.querySelector('#choice-product').textContent = [latest.code, latest.fr, portion(latest), euro(latest.price)].filter(Boolean).join(' · ');
      choiceNotice = '商品价格已更新，请核对最新金额后确认。';
    }
    updateChoice();
  }
}
window.addEventListener('bao-catalog-change', syncMenu);
syncMenu();
renderReceipt();
if (lastOrder) refreshReceipt();
